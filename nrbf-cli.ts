#!/usr/bin/env node

// nrbf-cli.ts

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import {
  NrbfDecoder,
  NrbfEncoder,
  NrbfUtils,
  NrbfRecord,
  ClassRecord,
  BinaryArrayRecord,
  ArraySinglePrimitiveRecord,
  ArraySingleObjectRecord,
  ArraySingleStringRecord,
  BinaryObjectStringRecord,
  MemberReferenceRecord,
  ObjectNullRecord,              
  ObjectNullMultipleRecord,      
  ObjectNullMultiple256Record,   
  MessageEndRecord,              
  RecordType,
  BinaryType,
  PrimitiveType,
} from './nrbf';

// Re-export types for use in this file
type ObjectValue = any;
type PrimitiveValue = boolean | number | string | bigint | null;

// ============================================================================
// CLI Configuration
// ============================================================================

interface CliOptions {
  input?: string;
  output?: string;
  format?: 'json' | 'pretty' | 'compact';
  path?: string;
  value?: string;
  patchFile?: string;
  guid?: string;
  newGuid?: string;
  offset?: number;
  backup?: boolean;
  verbose?: boolean;
  maxDepth?: number;
  maxItems?: number;
}

// ============================================================================
// Command Handlers
// ============================================================================

class NrbfCli {
  private decoder?: NrbfDecoder; // Store decoder for reference resolution

  private options: CliOptions;

  constructor(options: CliOptions) {
    this.options = {
      backup: true,
      verbose: false,
      maxDepth: 10,
      maxItems: 100,
      format: 'pretty',
      ...options
    };
  }

  /**
   * Hex dump of file
   */
  async hexdump(): Promise<void> {
    const buffer = this.readInputFile();
    const data = new Uint8Array(buffer);
    
    const lines = Math.min(this.options.maxItems || 32, Math.ceil(data.length / 16));
    
    for (let i = 0; i < lines; i++) {
      const offset = i * 16;
      const chunk = data.slice(offset, offset + 16);
      
      // Offset
      const offsetStr = `0x${offset.toString(16).padStart(8, '0')}`;
      
      // Hex bytes
      const hexStr = Array.from(chunk)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ')
        .padEnd(47, ' ');
      
      // ASCII
      const asciiStr = Array.from(chunk)
        .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.')
        .join('');
      
      this.log(`${offsetStr}  ${hexStr}  ${asciiStr}`);
    }
    
    if (lines * 16 < data.length) {
      this.log(`... (${data.length - lines * 16} more bytes)`);
    }
  }

  async export(): Promise<void> {
    const buffer = this.readInputFile();
    this.decoder = new NrbfDecoder(buffer, this.options.verbose || false);
    const root = this.decoder.decode();

    const json = this.recordToJson(root);
    const output = this.options.format === 'compact' 
      ? JSON.stringify(json)
      : JSON.stringify(json, null, 2);

    if (this.options.output) {
      fs.writeFileSync(this.options.output, output, 'utf8');
      this.success(`Exported to ${this.options.output}`);
    } else {
      console.log(output);
    }
  }

  private recordToJson(record: any, visited = new Set<number>()): any {
    if (record === null || record === undefined) {
      return null;
    }

    if (typeof record === 'boolean' || typeof record === 'number' || typeof record === 'string') {
      return record;
    }

    // Handle ObjectNullRecord
    if (record instanceof ObjectNullRecord) {
      return null;
    }

    // Handle MemberReference - RESOLVE IT
    if (record instanceof MemberReferenceRecord) {
      if (this.decoder) {
        const resolved = this.decoder.getRecord(record.idRef);
        if (resolved) {
          // Check for circular references
          if (resolved.objectId && visited.has(resolved.objectId)) {
            return { $ref: record.idRef, $circular: true };
          }
          return this.recordToJson(resolved, visited);
        }
      }
      return { $ref: record.idRef, $unresolved: true };
    }

    if (record instanceof ClassRecord) {
      // Track this object to detect circular references
      if (record.objectId) {
        if (visited.has(record.objectId)) {
          return { $ref: record.objectId, $circular: true };
        }
        visited.add(record.objectId);
      }

      const obj: any = {
        $type: record.typeName,
        $id: record.objectId,
      };

      // GUID special case
      if (record.typeName === 'System.Guid') {
        obj.$value = NrbfUtils.parseGuid(record);
      } else {
        for (const memberName of record.memberNames) {
          obj[memberName] = this.recordToJson(record.getValue(memberName), new Set(visited));
        }
      }

      return obj;
    }

    if (record instanceof BinaryArrayRecord ||
        record instanceof ArraySinglePrimitiveRecord ||
        record instanceof ArraySingleObjectRecord ||
        record instanceof ArraySingleStringRecord) {
      return record.getArray().map(item => this.recordToJson(item, new Set(visited)));
    }

    if (record instanceof BinaryObjectStringRecord) {
      return record.value;
    }

    return `[${record.constructor.name}]`;
  }

  async patch(): Promise<void> {
    if (!this.options.patchFile) {
      this.error('--patch-file is required');
    }

    const buffer = this.readInputFile();
    const decoder = new NrbfDecoder(buffer, this.options.verbose || false);
    const root = decoder.decode();

    const patchContent = fs.readFileSync(this.options.patchFile, 'utf8');
    const patches = JSON.parse(patchContent);

    this.log('=== APPLYING PATCHES ===\n');

    let modified = false;
    if (Array.isArray(patches)) {
      for (const patch of patches) {
        if (this.applyPatch(root, patch)) {
          modified = true;
        }
      }
    } else {
      if (this.applyPatch(root, patches)) {
        modified = true;
      }
    }

    if (!modified) {
      this.warn('No changes were made');
      return;
    }

    if (this.options.backup && this.options.input) {
      this.backupFile(this.options.input);
    }

    const encoder = new NrbfEncoder();
    const newBuffer = encoder.encode(root);
    
    const outputPath = this.options.output || this.options.input;
    if (!outputPath) {
      this.error('No output file specified');
    }

    fs.writeFileSync(outputPath, Buffer.from(newBuffer));
    this.success(`Patched file saved to ${outputPath}`);
  }

  async binaryPatch(): Promise<void> {
    if (!this.options.guid || !this.options.newGuid) {
      this.error('--guid and --new-guid are required');
    }

    let buffer = this.readInputFile();

    this.log('=== BINARY GUID PATCH ===\n');

    const matches = NrbfUtils.findGuidInBinary(buffer, this.options.guid);

    this.log(`Current GUID: ${this.options.guid}`);
    this.log(`New GUID:     ${this.options.newGuid}`);
    this.log(`Found ${matches.length} occurrence(s)`);

    if (matches.length === 0) {
      this.error('GUID not found in file');
    }

    if (matches.length > 1) {
      this.log('\nMultiple matches found at offsets:');
      matches.forEach((offset, i) => {
        this.log(`  [${i}] 0x${offset.toString(16).toUpperCase()}`);
      });

      if (this.options.offset === undefined) {
        this.error('Multiple matches found. Use --offset to specify which one to replace');
      }

      if (!matches.includes(this.options.offset)) {
        this.error(`Offset ${this.options.offset} is not a valid match`);
      }

      buffer = NrbfUtils.replaceGuidAtOffset(buffer, this.options.offset, this.options.newGuid);
      this.log(`\nReplaced GUID at offset 0x${this.options.offset.toString(16).toUpperCase()}`);
    } else {
      buffer = NrbfUtils.replaceGuidAtOffset(buffer, matches[0], this.options.newGuid);
      this.log(`\nReplaced GUID at offset 0x${matches[0].toString(16).toUpperCase()}`);
    }

    if (this.options.backup && this.options.input) {
      this.backupFile(this.options.input);
    }

    const outputPath = this.options.output || this.options.input;
    if (!outputPath) {
      this.error('No output file specified');
    }

    fs.writeFileSync(outputPath, Buffer.from(buffer));
    this.success(`Patched file saved to ${outputPath}`);
  }

  async get(): Promise<void> {
    if (!this.options.path) {
      this.error('--path is required');
    }

    const buffer = this.readInputFile();
    this.decoder = new NrbfDecoder(buffer, this.options.verbose || false);
    const root = this.decoder.decode();

    const value = NrbfUtils.getNestedValue(root, this.options.path, this.decoder);
    
    if (value === undefined) {
      this.error(`Path not found: ${this.options.path}`);
    }

    this.printRecord(value, 0, this.options.path);
  }

  async set(): Promise<void> {
    if (!this.options.path || !this.options.value) {
      this.error('--path and --value are required');
    }

    const buffer = this.readInputFile();
    this.decoder = new NrbfDecoder(buffer, this.options.verbose || false);
    const root = this.decoder.decode();

    const parts = this.options.path.split('.');
    const fieldName = parts.pop()!;
    const parentPath = parts.join('.');

    let parent: any = root;
    if (parentPath) {
      parent = NrbfUtils.getNestedValue(root, parentPath, this.decoder);
      
      // Resolve if it's a reference
      if (parent instanceof MemberReferenceRecord) {
        parent = this.decoder.getRecord(parent.idRef);
      }
    }

    if (!(parent instanceof ClassRecord)) {
      this.error('Parent is not a ClassRecord - can only set fields on class records');
    }

    const newValue = this.parseValue(this.options.value);

    this.log(`Setting ${this.options.path} = ${this.options.value}`);

    parent.setValue(fieldName, newValue);

    if (this.options.backup && this.options.input) {
      this.backupFile(this.options.input);
    }

    const encoder = new NrbfEncoder();
    const newBuffer = encoder.encode(root);
    
    const outputPath = this.options.output || this.options.input;
    if (!outputPath) {
      this.error('No output file specified');
    }

    fs.writeFileSync(outputPath, Buffer.from(newBuffer));
    this.success(`Updated file saved to ${outputPath}`);
  }

  async parse(): Promise<void> {
    const buffer = this.readInputFile();
    
    if (!NrbfUtils.startsWithPayloadHeader(buffer)) {
      this.error('Not a valid NRBF file!');
    }

    this.log('=== NRBF FILE INSPECTOR ===\n');
    
    this.decoder = new NrbfDecoder(buffer, this.options.verbose || false);
    const root = this.decoder.decode();

    this.log('File Info:');
    this.log(`  Size: ${buffer.byteLength} bytes`);
    this.log(`  Root Type: ${root.recordType}`);
    if (root.objectId) {
      this.log(`  Root ID: ${root.objectId}`);
    }
    this.log('');

    if (this.options.path) {
      const value = NrbfUtils.getNestedValue(root, this.options.path, this.decoder);
      this.log(`Value at path '${this.options.path}':`);
      this.printRecord(value, 0, this.options.path);
    } else {
      this.printRecord(root, 0, 'ROOT');
    }
  }

  async interactive(): Promise<void> {
    const buffer = this.readInputFile();
    const decoder = new NrbfDecoder(buffer, this.options.verbose || false);
    let root = decoder.decode();

    this.log('=== NRBF INTERACTIVE MODE ===');
    this.log('Commands: ls [path] | get <path> | set <path> <value> | patch <file> | save | exit\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'nrbf> '
    });

    rl.prompt();

    rl.on('line', async (line) => {
      const args = line.trim().split(/\s+/);
      const cmd = args[0];

      try {
        switch (cmd) {
          case 'ls':
            const lsPath = args[1] || '';
            const lsValue = lsPath ? NrbfUtils.getNestedValue(root, lsPath) : root;
            this.printRecord(lsValue, 0, lsPath || 'ROOT', 1);
            break;

          case 'get':
            if (!args[1]) {
              this.warn('Usage: get <path>');
              break;
            }
            const getValue = NrbfUtils.getNestedValue(root, args[1]);
            this.printRecord(getValue, 0, args[1]);
            break;

          case 'set':
            if (!args[1] || !args[2]) {
              this.warn('Usage: set <path> <value>');
              break;
            }
            const setParts = args[1].split('.');
            const setField = setParts.pop()!;
            const setParentPath = setParts.join('.');
            const setParent: any = setParentPath ? NrbfUtils.getNestedValue(root, setParentPath) : root;
            
            if (setParent instanceof ClassRecord) {
              const setValue = this.parseValue(args[2]);
              setParent.setValue(setField, setValue);
              this.success(`Set ${args[1]} = ${args[2]}`);
            } else {
              this.error('Parent is not a ClassRecord', false);
            }
            break;

          case 'patch':
            if (!args[1]) {
              this.warn('Usage: patch <file.json>');
              break;
            }
            const patchContent = fs.readFileSync(args[1], 'utf8');
            const patches = JSON.parse(patchContent);
            const patchArray = Array.isArray(patches) ? patches : [patches];
            
            for (const patch of patchArray) {
              this.applyPatch(root, patch);
            }
            this.success('Patches applied');
            break;

          case 'save':
            if (!this.options.input) {
              this.warn('No input file to save to');
              break;
            }
            if (this.options.backup) {
              this.backupFile(this.options.input);
            }
            const encoder = new NrbfEncoder();
            const newBuffer = encoder.encode(root);
            fs.writeFileSync(this.options.input, Buffer.from(newBuffer));
            this.success(`Saved to ${this.options.input}`);
            break;

          case 'exit':
          case 'quit':
            rl.close();
            return;

          case '':
            break;

          default:
            this.warn(`Unknown command: ${cmd}`);
        }
      } catch (err: any) {
        this.error(err.message, false);
      }

      rl.prompt();
    });

    rl.on('close', () => {
      this.log('\nGoodbye!');
      process.exit(0);
    });
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private readInputFile(): ArrayBuffer {
    if (!this.options.input) {
      this.error('No input file specified');
    }

    if (!fs.existsSync(this.options.input)) {
      this.error(`File not found: ${this.options.input}`);
    }

    if (this.options.verbose) {
      const stats = fs.statSync(this.options.input);
      this.log(`Reading file: ${this.options.input} (${stats.size} bytes)`);
    }

    const buffer = fs.readFileSync(this.options.input);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }

  private backupFile(filePath: string): void {
    const backupPath = `${filePath}.bak`;
    fs.copyFileSync(filePath, backupPath);
    this.log(`Backup created: ${backupPath}`);
  }

  private applyPatch(root: NrbfRecord, patch: any): boolean {
    if (!patch.path) {
      this.warn('Patch missing "path" field, skipping');
      return false;
    }

    const { path: patchPath, value: patchValue, op = 'set' } = patch;

    this.log(`Applying: ${op} ${patchPath}`);

    try {
      if (op === 'set') {
        const parts = patchPath.split('.');
        const fieldName = parts.pop()!;
        const parentPath = parts.join('.');

        let parent: any = root;
        if (parentPath) {
          parent = NrbfUtils.getNestedValue(root, parentPath);
        }

        if (parent instanceof ClassRecord) {
          const newValue = this.jsonToObjectValue(patchValue, parent, fieldName);
          parent.setValue(fieldName, newValue);
          this.log(`  ✓ Set ${patchPath}`);
          return true;
        } else {
          this.warn(`  ✗ Parent is not a ClassRecord`);
          return false;
        }
      } else if (op === 'delete') {
        this.warn(`  ✗ Delete operation not supported yet`);
        return false;
      } else if (op === 'merge') {
        const target: any = NrbfUtils.getNestedValue(root, patchPath);
        if (target instanceof ClassRecord) {
          this.mergeObject(target, patchValue);
          this.log(`  ✓ Merged into ${patchPath}`);
          return true;
        } else {
          this.warn(`  ✗ Target is not a ClassRecord`);
          return false;
        }
      }
    } catch (err: any) {
      this.warn(`  ✗ Error: ${err.message}`);
      return false;
    }

    return false;
  }

  private mergeObject(target: ClassRecord, source: any): void {
    for (const key in source) {
      if (target.memberNames.includes(key)) {
        const newValue = this.jsonToObjectValue(source[key], target, key);
        target.setValue(key, newValue);
      }
    }
  }

  private jsonToObjectValue(json: any, parent: ClassRecord, fieldName: string): any {
    if (json === null || json === undefined) {
      return null;
    }

    if (typeof json === 'boolean' || typeof json === 'number' || typeof json === 'string') {
      return json;
    }

    if (typeof json === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(json)) {
      const existing = parent.getValue(fieldName);
      if (existing instanceof ClassRecord && existing.typeName === 'System.Guid') {
        return NrbfUtils.createGuidRecord(existing.objectId!, json);
      }
    }

    throw new Error('Cannot convert complex JSON to NRBF record without type information');
  }

  private parseValue(valueStr: string): PrimitiveValue {
    try {
      const parsed = JSON.parse(valueStr);
      if (typeof parsed === 'boolean' || typeof parsed === 'number' || parsed === null) {
        return parsed;
      }
      if (typeof parsed === 'string') {
        return parsed;
      }
    } catch {
      // Not valid JSON
    }

    if (valueStr.toLowerCase() === 'true') return true;
    if (valueStr.toLowerCase() === 'false') return false;
    if (valueStr.toLowerCase() === 'null') return null;
    if (!isNaN(Number(valueStr))) return Number(valueStr);

    return valueStr;
  }

  private printRecord(record: any, indent: number, label: string, maxDepth?: number): void {
    const depth = maxDepth ?? this.options.maxDepth!;
    if (indent >= depth) {
      this.log(`${'  '.repeat(indent)}${label}: [Max depth reached]`);
      return;
    }

    const space = '  '.repeat(indent);

    if (record === null || record === undefined) {
      this.log(`${space}${label}: ${this.colorize('null', 'blue')}`);
      return;
    }

    if (typeof record === 'boolean' || typeof record === 'number' || typeof record === 'string') {
      this.log(`${space}${label}: ${this.formatValue(record)}`);
      return;
    }

    // Handle ObjectNullRecord
    if (record instanceof ObjectNullRecord) {
      this.log(`${space}${label}: ${this.colorize('null', 'blue')}`);
      return;
    }

    // Handle MemberReference - resolve and display WITHOUT the reference line
    if (record instanceof MemberReferenceRecord) {
      if (this.decoder) {
        const resolved = this.decoder.getRecord(record.idRef);
        if (resolved) {
          // Just recurse directly - no need to show the reference
          this.printRecord(resolved, indent, label, depth);
          return;
        }
      }
      // Only show unresolved references
      this.log(`${space}${label}: ${this.colorize(`→ ref #${record.idRef} (unresolved)`, 'red')}`);
      return;
    }

    // GUID special handling
    if (record instanceof ClassRecord && record.typeName === 'System.Guid') {
      const guid = NrbfUtils.parseGuid(record);
      this.log(`${space}${label}: ${this.colorize(guid, 'magenta')}`);
      return;
    }

    // Class Record
    if (record instanceof ClassRecord) {
      this.log(`${space}${this.colorize('▼', 'cyan')} ${label} [${this.colorize(record.typeName, 'cyan')}]`);
      
      let count = 0;
      for (const memberName of record.memberNames) {
        if (count >= this.options.maxItems!) {
          this.log(`${space}  ... (${record.memberNames.length - count} more fields)`);
          break;
        }
        const value = record.getValue(memberName);
        this.printRecord(value, indent + 1, memberName, depth);
        count++;
      }
      return;
    }

    // Arrays
    if (record instanceof BinaryArrayRecord ||
        record instanceof ArraySinglePrimitiveRecord ||
        record instanceof ArraySingleObjectRecord ||
        record instanceof ArraySingleStringRecord) {
      const arr = record.getArray();
      this.log(`${space}${this.colorize('█', 'yellow')} ${label} [Array: ${arr.length} items]`);
      
      for (let i = 0; i < Math.min(arr.length, this.options.maxItems!); i++) {
        this.printRecord(arr[i], indent + 1, `[${i}]`, depth);
      }
      
      if (arr.length > this.options.maxItems!) {
        this.log(`${space}  ... (${arr.length - this.options.maxItems!} more items)`);
      }
      return;
    }

    // String Record
    if (record instanceof BinaryObjectStringRecord) {
      this.log(`${space}${label}: "${this.colorize(record.value, 'green')}"`);
      return;
    }

    // Default
    this.log(`${space}${label}: [${record.constructor.name}]`);
  }

  private formatValue(value: any): string {
    if (typeof value === 'string') {
      return this.colorize(`"${value}"`, 'green');
    }
    if (typeof value === 'number') {
      return this.colorize(String(value), 'yellow');
    }
    if (typeof value === 'boolean') {
      return this.colorize(String(value), 'blue');
    }
    return String(value);
  }

  private colorize(text: string, color: string): string {
    const colors: Record<string, string> = {
      reset: '\x1b[0m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
    };

    return `${colors[color] || ''}${text}${colors.reset}`;
  }

  private log(message: string): void {
    console.log(message);
  }

  private success(message: string): void {
    console.log(this.colorize(`✓ ${message}`, 'green'));
  }

  private warn(message: string): void {
    console.warn(this.colorize(`⚠ ${message}`, 'yellow'));
  }

  private error(message: string, exit = true): never {
    console.error(this.colorize(`✗ ${message}`, 'red'));
    if (exit) {
      process.exit(1);
    }
    throw new Error(message);
  }
}

// ============================================================================
// Main CLI Entry Point
// ============================================================================

function printHelp(): void {
  console.log(`
NRBF CLI - Universal NRBF File Tool
====================================

USAGE:
  nrbf <command> [options]

COMMANDS:
  parse              Parse and display NRBF file structure
  export             Export NRBF to JSON
  patch              Apply JSON patch file (like .reg files)
  binary-patch       Binary GUID replacement
  get                Get value at path
  set                Set value at path
  interactive        Interactive mode
  help               Show this help

OPTIONS:
  -i, --input <file>       Input NRBF file (required)
  -o, --output <file>      Output file
  -p, --path <path>        Path to field (dot notation)
  -v, --value <value>      Value to set
  -f, --format <format>    Output format: json, pretty, compact (default: pretty)
  --patch-file <file>      JSON patch file
  --guid <guid>            Source GUID for replacement
  --new-guid <guid>        Target GUID for replacement
  --offset <offset>        Byte offset (for binary-patch with multiple matches)
  --no-backup              Don't create backup files
  --verbose                Verbose output
  --max-depth <n>          Max depth for display (default: 10)
  --max-items <n>          Max items per array (default: 100)

EXAMPLES:
  nrbf parse -i save.sav
  nrbf export -i save.sav -o save.json
  nrbf patch -i save.sav --patch-file changes.json
  nrbf binary-patch -i save.sav --guid "037b..." --new-guid "522..."
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    process.exit(0);
  }

  const command = args[0];
  const options: CliOptions = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '-i':
      case '--input':
        options.input = args[++i];
        break;
      case '-o':
      case '--output':
        options.output = args[++i];
        break;
      case '-p':
      case '--path':
        options.path = args[++i];
        break;
      case '-v':
      case '--value':
        options.value = args[++i];
        break;
      case '-f':
      case '--format':
        options.format = args[++i] as any;
        break;
      case '--patch-file':
        options.patchFile = args[++i];
        break;
      case '--guid':
        options.guid = args[++i];
        break;
      case '--new-guid':
        options.newGuid = args[++i];
        break;
      case '--offset':
        options.offset = parseInt(args[++i], 16);
        break;
      case '--no-backup':
        options.backup = false;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--max-depth':
        options.maxDepth = parseInt(args[++i]);
        break;
      case '--max-items':
        options.maxItems = parseInt(args[++i]);
        break;
    }
  }

  const cli = new NrbfCli(options);

  try {
    switch (command) {
      case 'parse':
        await cli.parse();
        break;
      case 'export':
        await cli.export();
        break;
      case 'patch':
        await cli.patch();
        break;
      case 'binary-patch':
        await cli.binaryPatch();
        break;
      case 'get':
        await cli.get();
        break;
      case 'set':
        await cli.set();
        break;
      case 'interactive':
      case 'i':
        await cli.interactive();
        break;
      case 'hexdump':
        await cli.hexdump();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    if (options.verbose) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { NrbfCli };