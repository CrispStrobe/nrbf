
# NRBF Parser & CLI

A complete TypeScript/JavaScript implementation of the .NET Remoting Binary Format (NRBF) parser, encoder, and CLI tool. Designed for cross-platform manipulation of Unity save files (`.sav`) and other NRBF-encoded data. Work in Progress. Patching / writing is yet to be tested thoroughly. So use with care and after backups always!

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

## Features

- 🔍 **Complete NRBF Implementation** - Parse and encode all NRBF record types
- 🎮 **Unity Save File Support** - Specialized for Unity game save files
- 🔧 **Powerful CLI** - Parse, inspect, edit, and patch NRBF files
- 🌐 **Cross-Platform** - Pure TypeScript, works in Node.js, browsers, Flutter WebView, and PWAs
- 📝 **JSON Export/Import** - Convert between NRBF and JSON with full type information
- 🔀 **Binary Patching** - Fast GUID replacement without full re-encoding
- 💾 **Automatic Backups** - Safe editing with automatic backup creation
- 🎨 **Interactive Mode** - REPL for exploring and modifying save files

## Installation

```bash
npm install
npm run build
```

Or use directly with Node:

```bash
node dist/nrbf-cli.js <command> [options]
```

## Quick Start

### Parse and Display a Save File

```bash
node dist/nrbf-cli.js parse -i PlayerData.sav
```

### Export to JSON

```bash
node dist/nrbf-cli.js export -i PlayerData.sav -o save.json
```

### Get a Specific Value

```bash
node dist/nrbf-cli.js get -i PlayerData.sav -p "<MiscData>k__BackingField.money"
```

### Set a Value

```bash
node dist/nrbf-cli.js set -i PlayerData.sav -p "<MiscData>k__BackingField.money" -v 99999
```

### Apply JSON Patches

```bash
# Create a patch file
cat > money.json << EOF
{
  "path": "<MiscData>k__BackingField.money",
  "op": "set",
  "value": 99999
}
EOF

# Apply the patch
node dist/nrbf-cli.js patch -i PlayerData.sav --patch-file money.json
```

### Binary GUID Patching

```bash
node dist/nrbf-cli.js binary-patch -i PlayerData.sav \
  --guid "037b1f7c-871e-4c44-8c0f-451bb24805ac" \
  --new-guid "522911f7-18ab-40c2-a749-1332e9aa7b96"
```

### Interactive Mode

```bash
node dist/nrbf-cli.js interactive -i PlayerData.sav

# Then use commands:
nrbf> ls <MiscData>k__BackingField
nrbf> get <MiscData>k__BackingField.money
nrbf> set <MiscData>k__BackingField.money 99999
nrbf> save
nrbf> exit
```

## CLI Commands

### `parse` - Parse and Display File Structure

```bash
node dist/nrbf-cli.js parse -i <file> [options]

Options:
  -p, --path <path>        Show only specific path (dot notation)
  --max-depth <n>          Maximum nesting depth (default: 10)
  --max-items <n>          Maximum array items to show (default: 100)
  --verbose                Show detailed parsing information
```

### `export` - Export to JSON

```bash
node dist/nrbf-cli.js export -i <file> -o <output.json> [options]

Options:
  -f, --format <format>    Output format: json, pretty, compact (default: pretty)
```

### `get` - Get Value at Path

```bash
node dist/nrbf-cli.js get -i <file> -p <path>

Example:
  node dist/nrbf-cli.js get -i save.sav -p "<MiscData>k__BackingField.money"
```

### `set` - Set Value at Path

```bash
node dist/nrbf-cli.js set -i <file> -p <path> -v <value> [options]

Options:
  -o, --output <file>      Output file (default: overwrite input)
  --no-backup              Don't create backup file

Example:
  node dist/nrbf-cli.js set -i save.sav -p "<MiscData>k__BackingField.money" -v 99999
```

### `patch` - Apply JSON Patch File

```bash
node dist/nrbf-cli.js patch -i <file> --patch-file <patch.json> [options]

Options:
  -o, --output <file>      Output file (default: overwrite input)
  --no-backup              Don't create backup file
```

### `binary-patch` - Binary GUID Replacement

```bash
node dist/nrbf-cli.js binary-patch -i <file> --guid <old> --new-guid <new> [options]

Options:
  --offset <offset>        Byte offset (hex) for multiple matches
  -o, --output <file>      Output file (default: overwrite input)
  --no-backup              Don't create backup file
```

### `hexdump` - Hex Dump of File

```bash
node dist/nrbf-cli.js hexdump -i <file> [--max-items <lines>]
```

### `interactive` - Interactive REPL Mode

```bash
node dist/nrbf-cli.js interactive -i <file>

Commands:
  ls [path]              List contents at path
  get <path>             Get value at path
  set <path> <value>     Set value at path
  patch <file>           Apply patch file
  save                   Save changes
  exit                   Exit interactive mode
```

## JSON Patch Format

### Single Operation

```json
{
  "path": "<MiscData>k__BackingField.money",
  "op": "set",
  "value": 99999
}
```

### Multiple Operations

```json
[
  {
    "path": "<MiscData>k__BackingField.money",
    "op": "set",
    "value": 99999
  },
  {
    "path": "<MiscData>k__BackingField.stat_candycanes",
    "op": "set",
    "value": 100
  }
]
```

### Merge Operation

```json
{
  "path": "<CurrentClothes>k__BackingField",
  "op": "merge",
  "value": {
    "<ClothingHat>k__BackingField": {
      "clothingPrefabGUID": "e38ba795-8855-4c16-8acc-48d29b6c431b"
    }
  }
}
```

## Programmatic Usage

### TypeScript/JavaScript

```typescript
import { NrbfDecoder, NrbfEncoder, NrbfUtils, ClassRecord } from './nrbf';

// Load and parse
const buffer = fs.readFileSync('PlayerData.sav');
const decoder = new NrbfDecoder(buffer.buffer);
const root = decoder.decode();

// Navigate structure
const money = NrbfUtils.getNestedValue(
  root, 
  '<MiscData>k__BackingField.money',
  decoder
);
console.log('Money:', money);

// Modify value
const miscData = NrbfUtils.getNestedValue(
  root,
  '<MiscData>k__BackingField',
  decoder
) as ClassRecord;

miscData.setValue('money', 99999);

// Encode and save
const encoder = new NrbfEncoder();
const newBuffer = encoder.encode(root);
fs.writeFileSync('PlayerData.sav', Buffer.from(newBuffer));
```

### Browser/PWA

```typescript
// File input handler
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
fileInput.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const buffer = await file.arrayBuffer();
  const decoder = new NrbfDecoder(buffer);
  const root = decoder.decode();

  // Work with root...
});
```

### Flutter WebView

```dart
import 'dart:js' as js;

// Expose to Dart
final nrbf = js.context['nrbfTools'];

// Parse file
final result = nrbf.callMethod('parse', [fileBytes]);
```

## Supported NRBF Record Types

✅ SerializedStreamHeader  
✅ BinaryLibrary  
✅ ClassWithMembersAndTypes  
✅ SystemClassWithMembersAndTypes  
✅ ClassWithMembers  
✅ SystemClassWithMembers  
✅ ClassWithId  
✅ BinaryObjectString  
✅ BinaryArray (all array types)  
✅ ArraySinglePrimitive  
✅ ArraySingleObject  
✅ ArraySingleString  
✅ MemberPrimitiveTyped  
✅ MemberReference  
✅ ObjectNull  
✅ ObjectNullMultiple  
✅ ObjectNullMultiple256  
✅ MessageEnd  

## Supported Primitive Types

✅ Boolean, Byte, SByte, Char  
✅ Int16, Int32, Int64  
✅ UInt16, UInt32, UInt64  
✅ Single, Double, Decimal  
✅ DateTime, TimeSpan  
✅ String, Null  

## Unity-Specific Features

- **GUID Handling** - Automatic parsing and reconstruction of Unity GUIDs (`System.Guid`)
- **List\<T\> Support** - Proper handling of C# generic lists with `_items`, `_size`, `_version`
- **Dictionary Support** - Full `Dictionary<K,V>` parsing
- **SerializableColor** - Unity color structure support
- **Nested Classes** - Full support for Unity's backing field pattern (`<FieldName>k__BackingField`)

## Architecture

### Core Components

- **NrbfDecoder** - Parses NRBF binary format into record objects
- **NrbfEncoder** - Encodes record objects back to NRBF binary format
- **Record Classes** - Strongly-typed representations of NRBF records
- **BinaryReader/Writer** - Low-level binary I/O with proper encoding
- **NrbfUtils** - Helper functions for GUID parsing, path navigation, binary patching

### Design Principles

1. **Pure JavaScript** - No Node.js-specific dependencies
2. **Type Safety** - Full TypeScript type definitions
3. **Cross-Platform** - Works in Node.js, browsers, Flutter, PWAs
4. **Forward References** - Handles forward object references correctly
5. **Memory Efficient** - Chunk-based writing, streaming-friendly

## Development

### Build

```bash
npm run build
```

### Project Structure

```
nrbf/
├── nrbf.ts           # Core library (decoder, encoder, records)
├── nrbf-cli.ts       # CLI tool
├── package.json
├── tsconfig.json
├── dist/             # Compiled output
└── README.md
```

## License

This project is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0).

This means:
- ✅ You can use this software for any purpose
- ✅ You can modify the software
- ✅ You can distribute the software
- ⚠️ You must disclose the source code of any modifications
- ⚠️ You must license derivatives under AGPL-3.0
- ⚠️ If you run a modified version as a network service, you must make the source available

See [LICENSE](LICENSE) for full details.

## Credits

Developed with reference to:
- [nrbf-parser](https://github.com/driedpampas/nrbf-parser) (Rust implementation)
- [Microsoft's NrbfDecoder](https://github.com/dotnet/runtime) (.NET implementation)

**Made with ❤️ for the Unity modding community**
