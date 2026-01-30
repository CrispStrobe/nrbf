// nrbf.ts - NRBF Parser/Encoder for Unity .sav files

/**
 * NRBF Record Types
 */
enum RecordType {
  SerializedStreamHeader = 0,
  ClassWithId = 1,
  SystemClassWithMembers = 2,
  ClassWithMembers = 3,
  SystemClassWithMembersAndTypes = 4,
  ClassWithMembersAndTypes = 5,
  BinaryObjectString = 6,
  BinaryArray = 7,
  MemberPrimitiveTyped = 8,
  MemberReference = 9,
  ObjectNull = 10,
  MessageEnd = 11,
  BinaryLibrary = 12,
  ObjectNullMultiple256 = 13,
  ObjectNullMultiple = 14,
  ArraySinglePrimitive = 15,
  ArraySingleObject = 16,
  ArraySingleString = 17,
}

/**
 * Binary Types
 */
enum BinaryType {
  Primitive = 0,
  String = 1,
  Object = 2,
  SystemClass = 3,
  Class = 4,
  ObjectArray = 5,
  StringArray = 6,
  PrimitiveArray = 7,
}

/**
 * Primitive Types
 */
enum PrimitiveType {
  Boolean = 1,
  Byte = 2,
  Char = 3,
  Decimal = 5,
  Double = 6,
  Int16 = 7,
  Int32 = 8,
  Int64 = 9,
  SByte = 10,
  Single = 11,
  TimeSpan = 12,
  DateTime = 13,
  UInt16 = 14,
  UInt32 = 15,
  UInt64 = 16,
  Null = 17,
  String = 18,
}

/**
 * Binary Array Types
 */
enum BinaryArrayType {
  Single = 0,
  Jagged = 1,
  Rectangular = 2,
  SingleOffset = 3,
  JaggedOffset = 4,
  RectangularOffset = 5,
}

/**
 * Base class for all NRBF records
 */
abstract class NrbfRecord {
  abstract get recordType(): RecordType;
  abstract get objectId(): number | null;
}

/**
 * Serialization Header
 */
class SerializationHeader extends NrbfRecord {
  constructor(
    public rootId: number,
    public headerId: number,
    public majorVersion: number,
    public minorVersion: number
  ) {
    super();
  }

  get recordType() { return RecordType.SerializedStreamHeader; }
  get objectId() { return null; }
}

/**
 * Binary Library
 */
class BinaryLibrary extends NrbfRecord {
  constructor(
    public libraryId: number,
    public libraryName: string
  ) {
    super();
  }

  get recordType() { return RecordType.BinaryLibrary; }
  get objectId() { return this.libraryId; }
}

/**
 * Class Information
 */
interface ClassInfo {
  objectId: number;
  name: string;
  memberCount: number;
  memberNames: string[];
}

/**
 * Additional Type Info
 */
type AdditionalTypeInfo = 
  | { type: 'Primitive'; primitiveType: PrimitiveType }
  | { type: 'SystemClass'; className: string }
  | { type: 'Class'; className: string; libraryId: number }
  | { type: 'None' };

/**
 * Class Type Info
 */
interface ClassTypeInfo {
  typeName: string;
  libraryId: number;
}

/**
 * Member Type Information
 */
interface MemberTypeInfo {
  binaryTypeEnums: BinaryType[];
  additionalInfos: AdditionalTypeInfo[];
}

/**
 * Primitive Values
 */
type PrimitiveValue = 
  | boolean 
  | number 
  | string 
  | bigint 
  | null;

/**
 * Object Values (can be primitive or nested record)
 */
type ObjectValue = PrimitiveValue | NrbfRecord;

/**
 * Class Record (like SavePlayerPersistentData, ClothingPieceData, etc.)
 */
class ClassRecord extends NrbfRecord {
  public memberValues: Map<string, ObjectValue> = new Map();

  constructor(
    public classInfo: ClassInfo,
    public memberTypeInfo: MemberTypeInfo | null,
    public libraryId: number | null,
    public recordTypeValue: RecordType
  ) {
    super();
  }

  get recordType() { return this.recordTypeValue; }
  get objectId() { return this.classInfo.objectId; }
  get typeName() { return this.classInfo.name; }
  get memberNames() { return this.classInfo.memberNames; }

  getValue(memberName: string): ObjectValue | undefined {
    return this.memberValues.get(memberName);
  }

  setValue(memberName: string, value: ObjectValue): void {
    if (!this.classInfo.memberNames.includes(memberName)) {
      throw new Error(`Member '${memberName}' does not exist in class '${this.classInfo.name}'`);
    }
    this.memberValues.set(memberName, value);
  }

  static reconstructGuid(guidRecord: ClassRecord): string {
    const a = guidRecord.getValue('_a') as number;
    const b = guidRecord.getValue('_b') as number;
    const c = guidRecord.getValue('_c') as number;
    const d = guidRecord.getValue('_d') as number;
    const e = guidRecord.getValue('_e') as number;
    const f = guidRecord.getValue('_f') as number;
    const g = guidRecord.getValue('_g') as number;
    const h = guidRecord.getValue('_h') as number;
    const i = guidRecord.getValue('_i') as number;
    const j = guidRecord.getValue('_j') as number;
    const k = guidRecord.getValue('_k') as number;

    const bytes = new Uint8Array([
      a & 0xFF, (a >> 8) & 0xFF, (a >> 16) & 0xFF, (a >> 24) & 0xFF,
      b & 0xFF, (b >> 8) & 0xFF,
      c & 0xFF, (c >> 8) & 0xFF,
      d, e, f, g, h, i, j, k
    ]);

    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  static createGuidRecord(objectId: number, guidString: string): ClassRecord {
    const hex = guidString.replace(/-/g, '');
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }

    const classInfo: ClassInfo = {
      objectId,
      name: 'System.Guid',
      memberCount: 11,
      memberNames: ['_a', '_b', '_c', '_d', '_e', '_f', '_g', '_h', '_i', '_j', '_k']
    };

    const memberTypeInfo: MemberTypeInfo = {
      binaryTypeEnums: Array(11).fill(BinaryType.Primitive),
      additionalInfos: [
        { type: 'Primitive', primitiveType: PrimitiveType.Int32 },
        { type: 'Primitive', primitiveType: PrimitiveType.Int16 },
        { type: 'Primitive', primitiveType: PrimitiveType.Int16 },
        { type: 'Primitive', primitiveType: PrimitiveType.Byte },
        { type: 'Primitive', primitiveType: PrimitiveType.Byte },
        { type: 'Primitive', primitiveType: PrimitiveType.Byte },
        { type: 'Primitive', primitiveType: PrimitiveType.Byte },
        { type: 'Primitive', primitiveType: PrimitiveType.Byte },
        { type: 'Primitive', primitiveType: PrimitiveType.Byte },
        { type: 'Primitive', primitiveType: PrimitiveType.Byte },
        { type: 'Primitive', primitiveType: PrimitiveType.Byte },
      ]
    };

    const record = new ClassRecord(classInfo, memberTypeInfo, null, RecordType.SystemClassWithMembersAndTypes);
    
    const view = new DataView(bytes.buffer);
    record.setValue('_a', view.getInt32(0, true));
    record.setValue('_b', view.getInt16(4, true));
    record.setValue('_c', view.getInt16(6, true));
    record.setValue('_d', bytes[8]);
    record.setValue('_e', bytes[9]);
    record.setValue('_f', bytes[10]);
    record.setValue('_g', bytes[11]);
    record.setValue('_h', bytes[12]);
    record.setValue('_i', bytes[13]);
    record.setValue('_j', bytes[14]);
    record.setValue('_k', bytes[15]);

    return record;
  }
}

/**
 * Binary Array Record
 */
class BinaryArrayRecord extends NrbfRecord {
  constructor(
    public arrayObjectId: number,
    public binaryArrayTypeEnum: BinaryArrayType,
    public rank: number,
    public lengths: number[],
    public lowerBounds: number[] | null,
    public typeEnum: BinaryType,
    public additionalTypeInfo: AdditionalTypeInfo,
    public elementValues: ObjectValue[]
  ) {
    super();
  }

  get recordType() { return RecordType.BinaryArray; }
  get objectId() { return this.arrayObjectId; }

  getArray(): ObjectValue[] {
    return this.elementValues;
  }

  getTotalLength(): number {
    return this.lengths.reduce((a, b) => a * b, 1);
  }
}

/**
 * Simple Array Records
 */
class ArraySinglePrimitiveRecord extends NrbfRecord {
  constructor(
    public arrayObjectId: number,
    public length: number,
    public primitiveTypeEnum: PrimitiveType,
    public elementValues: PrimitiveValue[]
  ) {
    super();
  }

  get recordType() { return RecordType.ArraySinglePrimitive; }
  get objectId() { return this.arrayObjectId; }

  getArray(): PrimitiveValue[] {
    return this.elementValues;
  }
}

class ArraySingleObjectRecord extends NrbfRecord {
  constructor(
    public arrayObjectId: number,
    public length: number,
    public elementValues: ObjectValue[]
  ) {
    super();
  }

  get recordType() { return RecordType.ArraySingleObject; }
  get objectId() { return this.arrayObjectId; }

  getArray(): ObjectValue[] {
    return this.elementValues;
  }
}

class ArraySingleStringRecord extends NrbfRecord {
  constructor(
    public arrayObjectId: number,
    public length: number,
    public elementValues: ObjectValue[]
  ) {
    super();
  }

  get recordType() { return RecordType.ArraySingleString; }
  get objectId() { return this.arrayObjectId; }

  getArray(): ObjectValue[] {
    return this.elementValues;
  }
}

/**
 * String Record
 */
class BinaryObjectStringRecord extends NrbfRecord {
  constructor(
    public stringObjectId: number,
    public value: string
  ) {
    super();
  }

  get recordType() { return RecordType.BinaryObjectString; }
  get objectId() { return this.stringObjectId; }
}

/**
 * Member Primitive Typed - COMPLETE record
 */
class MemberPrimitiveTypedRecord extends NrbfRecord {
  constructor(
    public primitiveTypeEnum: PrimitiveType,
    public value: PrimitiveValue
  ) {
    super();
  }

  get recordType() { return RecordType.MemberPrimitiveTyped; }
  get objectId() { return null; }
}

/**
 * Member Reference
 */
class MemberReferenceRecord extends NrbfRecord {
  constructor(public idRef: number) {
    super();
  }

  get recordType() { return RecordType.MemberReference; }
  get objectId() { return null; }
}

/**
 * Object Null
 */
class ObjectNullRecord extends NrbfRecord {
  static instance = new ObjectNullRecord();
  
  get recordType() { return RecordType.ObjectNull; }
  get objectId() { return null; }
}

/**
 * Object Null Multiple - COMPLETE record
 */
class ObjectNullMultipleRecord extends NrbfRecord {
  constructor(public nullCount: number) {
    super();
  }

  get recordType() { return RecordType.ObjectNullMultiple; }
  get objectId() { return null; }
}

/**
 * Object Null Multiple 256 - COMPLETE record
 */
class ObjectNullMultiple256Record extends NrbfRecord {
  constructor(public nullCount: number) {
    super();
  }

  get recordType() { return RecordType.ObjectNullMultiple256; }
  get objectId() { return null; }
}

/**
 * Message End
 */
class MessageEndRecord extends NrbfRecord {
  static instance = new MessageEndRecord();
  
  get recordType() { return RecordType.MessageEnd; }
  get objectId() { return null; }
}

/**
 * Binary Reader for NRBF streams
 */
class BinaryReader {
  private view: DataView;
  private offset: number = 0;
  private decoder = new TextDecoder('utf-8');

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  readByte(): number {
    return this.view.getUint8(this.offset++);
  }

  readSByte(): number {
    return this.view.getInt8(this.offset++);
  }

  readInt16(): number {
    const value = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readUInt16(): number {
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readInt32(): number {
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readUInt32(): number {
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readInt64(): bigint {
    const value = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readUInt64(): bigint {
    const value = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readSingle(): number {
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readDouble(): number {
    const value = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readBoolean(): boolean {
    return this.readByte() !== 0;
  }

  readChar(): string {
    return String.fromCharCode(this.readByte());
  }

  readDecimal(): string {
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      bytes[i] = this.readByte();
    }
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  readDateTime(): bigint {
    return this.readUInt64();
  }

  readTimeSpan(): bigint {
    return this.readInt64();
  }

  readVariableLengthInt(): number {
    let value = 0;
    let shift = 0;
    
    while (shift < 35) {
      const b = this.readByte();
      value |= (b & 0x7F) << shift;
      
      if ((b & 0x80) === 0) {
        return value;
      }
      
      shift += 7;
    }
    
    throw new Error('Variable length int too long');
  }

  readLengthPrefixedString(): string {
    const length = this.readVariableLengthInt();
    
    if (length === 0) {
      return '';
    }
    
    if (length < 0) {
      throw new Error('Invalid string length');
    }
    
    const bytes = new Uint8Array(this.view.buffer, this.offset, length);
    this.offset += length;
    
    return this.decoder.decode(bytes);
  }

  getPosition(): number {
    return this.offset;
  }

  hasMore(): boolean {
    return this.offset < this.view.byteLength;
  }
}

/**
 * Binary Writer for NRBF streams
 */
class BinaryWriter {
  private chunks: Uint8Array[] = [];
  private encoder = new TextEncoder();

  writeByte(value: number): void {
    this.chunks.push(new Uint8Array([value]));
  }

  writeSByte(value: number): void {
    const arr = new Int8Array([value]);
    this.chunks.push(new Uint8Array(arr.buffer));
  }

  writeInt16(value: number): void {
    const buf = new ArrayBuffer(2);
    new DataView(buf).setInt16(0, value, true);
    this.chunks.push(new Uint8Array(buf));
  }

  writeUInt16(value: number): void {
    const buf = new ArrayBuffer(2);
    new DataView(buf).setUint16(0, value, true);
    this.chunks.push(new Uint8Array(buf));
  }

  writeInt32(value: number): void {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, value, true);
    this.chunks.push(new Uint8Array(buf));
  }

  writeUInt32(value: number): void {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setUint32(0, value, true);
    this.chunks.push(new Uint8Array(buf));
  }

  writeInt64(value: bigint): void {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setBigInt64(0, value, true);
    this.chunks.push(new Uint8Array(buf));
  }

  writeUInt64(value: bigint): void {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setBigUint64(0, value, true);
    this.chunks.push(new Uint8Array(buf));
  }

  writeSingle(value: number): void {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, value, true);
    this.chunks.push(new Uint8Array(buf));
  }

  writeDouble(value: number): void {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, value, true);
    this.chunks.push(new Uint8Array(buf));
  }

  writeBoolean(value: boolean): void {
    this.writeByte(value ? 1 : 0);
  }

  writeChar(value: string): void {
    this.writeByte(value.charCodeAt(0));
  }

  writeDecimal(hexString: string): void {
    for (let i = 0; i < 32; i += 2) {
      this.writeByte(parseInt(hexString.slice(i, i + 2), 16));
    }
  }

  writeDateTime(value: bigint): void {
    this.writeUInt64(value);
  }

  writeTimeSpan(value: bigint): void {
    this.writeInt64(value);
  }

  writeVariableLengthInt(value: number): void {
    while (true) {
      let b = value & 0x7F;
      value >>= 7;
      
      if (value > 0) {
        b |= 0x80;
        this.writeByte(b);
      } else {
        this.writeByte(b);
        break;
      }
    }
  }

  writeLengthPrefixedString(str: string): void {
    const bytes = this.encoder.encode(str);
    this.writeVariableLengthInt(bytes.length);
    this.chunks.push(bytes);
  }

  toBuffer(): ArrayBuffer {
    const totalLength = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    return result.buffer;
  }
}

/**
 * NRBF Decoder
 */
export class NrbfDecoder {
  private reader: BinaryReader;
  private recordMap = new Map<number, NrbfRecord>();
  private libraryMap = new Map<number, string>();
  private metadataMap = new Map<number, { 
    classInfo: ClassInfo; 
    memberTypeInfo: MemberTypeInfo | null; 
    libraryId: number | null 
  }>();
  private verbose: boolean = false;

  constructor(buffer: ArrayBuffer, verbose: boolean = false) {
    this.reader = new BinaryReader(buffer);
    this.verbose = verbose;
  }

  private log(message: string): void {
    if (this.verbose) {
      console.error(`[NRBF] ${message}`);
    }
  }

  decode(): NrbfRecord {
    this.log(`Starting decode, buffer size: ${this.reader['view'].byteLength} bytes`);
    this.log(`Position: 0x${this.reader.getPosition().toString(16)}`);
    
    // Read header byte
    const headerByte = this.reader.readByte();
    this.log(`Header byte: 0x${headerByte.toString(16)} (expected 0x00 for SerializationHeader)`);
    
    if (headerByte !== RecordType.SerializedStreamHeader) {
      throw new Error(`Invalid header: expected 0x00, got 0x${headerByte.toString(16)}`);
    }
    
    // Read header fields
    const rootId = this.reader.readInt32();
    const headerId = this.reader.readInt32();
    const majorVersion = this.reader.readInt32();
    const minorVersion = this.reader.readInt32();
    
    this.log(`Header: rootId=${rootId}, headerId=${headerId}, version=${majorVersion}.${minorVersion}`);
    this.log(`Position after header: 0x${this.reader.getPosition().toString(16)}`);
    
    const header = new SerializationHeader(rootId, headerId, majorVersion, minorVersion);
    
    let record: NrbfRecord;
    let count = 0;
    do {
      const pos = this.reader.getPosition();
      this.log(`\nRecord #${count} at offset 0x${pos.toString(16)}`);
      record = this.decodeNext();
      this.log(`  -> ${record.constructor.name}${record.objectId ? ` (ID: ${record.objectId})` : ''}`);
      count++;
      
      if (count > 100000) {
        throw new Error('Too many records - possible infinite loop');
      }
    } while (!(record instanceof MessageEndRecord));
    
    this.log(`\nTotal records decoded: ${count}`);
    this.log(`Root ID from header: ${header.rootId}`);
    this.log(`Available record IDs: ${Array.from(this.recordMap.keys()).sort((a, b) => a - b).join(', ')}`);
    
    const root = this.recordMap.get(header.rootId);
    if (!root) {
      throw new Error(`Root object with ID ${header.rootId} not found`);
    }
    
    return root;
  }

  private decodeNext(): NrbfRecord {
    const pos = this.reader.getPosition();
    const recordTypeByte = this.reader.readByte();
    
    this.log(`  Offset 0x${pos.toString(16)}: RecordType byte = 0x${recordTypeByte.toString(16)}`);
    
    // Validate record type
    const validTypes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    if (!validTypes.includes(recordTypeByte)) {
      // Show context
      const contextStart = Math.max(0, pos - 16);
      const contextBytes: number[] = [];
      
      // Read some context bytes (temporarily rewind)
      const savedPos = this.reader.getPosition();
      for (let i = 0; i < 32 && contextStart + i < this.reader['view'].byteLength; i++) {
        contextBytes.push(this.reader['view'].getUint8(contextStart + i));
      }
      
      const hexContext = contextBytes.map((b, i) => {
        const offset = contextStart + i;
        const marker = offset === pos ? '>' : ' ';
        return `${marker}0x${offset.toString(16).padStart(4, '0')}: 0x${b.toString(16).padStart(2, '0')}`;
      }).join('\n');
      
      throw new Error(
        `Unsupported record type: ${recordTypeByte} (0x${recordTypeByte.toString(16)}) at offset 0x${pos.toString(16)}\n` +
        `Context:\n${hexContext}`
      );
    }
    
    switch (recordTypeByte) {
      case RecordType.SerializedStreamHeader:
        this.log(`    -> SerializedStreamHeader`);
        return this.decodeSerializationHeader();
      
      case RecordType.BinaryLibrary:
        this.log(`    -> BinaryLibrary`);
        return this.decodeBinaryLibrary();
      
      case RecordType.ClassWithMembersAndTypes:
        this.log(`    -> ClassWithMembersAndTypes`);
        return this.decodeClassWithMembersAndTypes();
      
      case RecordType.SystemClassWithMembersAndTypes:
        this.log(`    -> SystemClassWithMembersAndTypes`);
        return this.decodeSystemClassWithMembersAndTypes();
      
      case RecordType.SystemClassWithMembers:
        this.log(`    -> SystemClassWithMembers`);
        return this.decodeSystemClassWithMembers();
      
      case RecordType.ClassWithMembers:
        this.log(`    -> ClassWithMembers`);
        return this.decodeClassWithMembers();
      
      case RecordType.ClassWithId:
        this.log(`    -> ClassWithId`);
        return this.decodeClassWithId();
      
      case RecordType.BinaryObjectString:
        this.log(`    -> BinaryObjectString`);
        return this.decodeBinaryObjectString();
      
      case RecordType.BinaryArray:
        this.log(`    -> BinaryArray`);
        return this.decodeBinaryArray();
      
      case RecordType.ArraySinglePrimitive:
        this.log(`    -> ArraySinglePrimitive`);
        return this.decodeArraySinglePrimitive();
      
      case RecordType.ArraySingleObject:
        this.log(`    -> ArraySingleObject`);
        return this.decodeArraySingleObject();
      
      case RecordType.ArraySingleString:
        this.log(`    -> ArraySingleString`);
        return this.decodeArraySingleString();
      
      case RecordType.MemberPrimitiveTyped:
        this.log(`    -> MemberPrimitiveTyped`);
        return this.decodeMemberPrimitiveTyped();
      
      case RecordType.MemberReference:
        this.log(`    -> MemberReference`);
        return this.decodeMemberReference();
      
      case RecordType.ObjectNull:
        this.log(`    -> ObjectNull`);
        return ObjectNullRecord.instance;
      
      case RecordType.ObjectNullMultiple:
        this.log(`    -> ObjectNullMultiple`);
        return this.decodeObjectNullMultiple();
      
      case RecordType.ObjectNullMultiple256:
        this.log(`    -> ObjectNullMultiple256`);
        return this.decodeObjectNullMultiple256();
      
      case RecordType.MessageEnd:
        this.log(`    -> MessageEnd`);
        return MessageEndRecord.instance;
      
      default:
        throw new Error(`Unhandled record type: ${recordTypeByte}`);
    }
  }

  private decodeSerializationHeader(): SerializationHeader {
    const rootId = this.reader.readInt32();
    const headerId = this.reader.readInt32();
    const majorVersion = this.reader.readInt32();
    const minorVersion = this.reader.readInt32();
    
    this.log(`      rootId=${rootId}, headerId=${headerId}, version=${majorVersion}.${minorVersion}`);
    
    return new SerializationHeader(rootId, headerId, majorVersion, minorVersion);
  }

  private decodeBinaryLibrary(): BinaryLibrary {
    const libraryId = this.reader.readInt32();
    const libraryName = this.reader.readLengthPrefixedString();
    
    this.log(`      libraryId=${libraryId}, libraryName="${libraryName}"`);
    
    const record = new BinaryLibrary(libraryId, libraryName);
    this.libraryMap.set(libraryId, libraryName);
    // Note: BinaryLibrary records don't go in recordMap (they have no typical objectId)
    
    return record;
  }

  private readClassInfo(): ClassInfo {
    const objectId = this.reader.readInt32();
    const name = this.reader.readLengthPrefixedString();
    const memberCount = this.reader.readInt32();
    const memberNames: string[] = [];
    
    for (let i = 0; i < memberCount; i++) {
      memberNames.push(this.reader.readLengthPrefixedString());
    }
    
    return { objectId, name, memberCount, memberNames };
  }

  private readMemberTypeInfo(memberCount: number): MemberTypeInfo {
    const binaryTypeEnums: BinaryType[] = [];
    
    for (let i = 0; i < memberCount; i++) {
      binaryTypeEnums.push(this.reader.readByte());
    }
    
    const additionalInfos: AdditionalTypeInfo[] = [];
    
    for (let i = 0; i < memberCount; i++) {
      const binaryType = binaryTypeEnums[i];
      
      switch (binaryType) {
        case BinaryType.Primitive:
          additionalInfos.push({
            type: 'Primitive',
            primitiveType: this.reader.readByte()
          });
          break;
        
        case BinaryType.SystemClass:
          additionalInfos.push({
            type: 'SystemClass',
            className: this.reader.readLengthPrefixedString()
          });
          break;
        
        case BinaryType.Class:
          additionalInfos.push({
            type: 'Class',
            className: this.reader.readLengthPrefixedString(),
            libraryId: this.reader.readInt32()
          });
          break;
        
        default:
          additionalInfos.push({ type: 'None' });
      }
    }
    
    return { binaryTypeEnums, additionalInfos };
  }

  private decodeClassWithMembersAndTypes(): ClassRecord {
    const classInfo = this.readClassInfo();
    const memberTypeInfo = this.readMemberTypeInfo(classInfo.memberCount);
    const libraryId = this.reader.readInt32();
    
    const record = new ClassRecord(classInfo, memberTypeInfo, libraryId, RecordType.ClassWithMembersAndTypes);
    
    this.metadataMap.set(classInfo.objectId, { classInfo, memberTypeInfo, libraryId });
    this.recordMap.set(classInfo.objectId, record);
    
    this.readMemberValues(record, classInfo.memberNames, memberTypeInfo);
    
    return record;
  }

  private decodeSystemClassWithMembersAndTypes(): ClassRecord {
    const classInfo = this.readClassInfo();
    const memberTypeInfo = this.readMemberTypeInfo(classInfo.memberCount);
    
    const record = new ClassRecord(classInfo, memberTypeInfo, null, RecordType.SystemClassWithMembersAndTypes);
    
    this.metadataMap.set(classInfo.objectId, { classInfo, memberTypeInfo, libraryId: null });
    this.recordMap.set(classInfo.objectId, record);
    
    this.readMemberValues(record, classInfo.memberNames, memberTypeInfo);
    
    return record;
  }

  private decodeSystemClassWithMembers(): ClassRecord {
    const classInfo = this.readClassInfo();
    
    const record = new ClassRecord(classInfo, null, null, RecordType.SystemClassWithMembers);
    
    this.metadataMap.set(classInfo.objectId, { classInfo, memberTypeInfo: null, libraryId: null });
    this.recordMap.set(classInfo.objectId, record);
    
    for (const memberName of classInfo.memberNames) {
      const value = this.decodeNext();
      record.memberValues.set(memberName, value);
    }
    
    return record;
  }

  private decodeClassWithMembers(): ClassRecord {
    const classInfo = this.readClassInfo();
    const libraryId = this.reader.readInt32();
    
    const record = new ClassRecord(classInfo, null, libraryId, RecordType.ClassWithMembers);
    
    this.metadataMap.set(classInfo.objectId, { classInfo, memberTypeInfo: null, libraryId });
    this.recordMap.set(classInfo.objectId, record);
    
    for (const memberName of classInfo.memberNames) {
      const value = this.decodeNext();
      record.memberValues.set(memberName, value);
    }
    
    return record;
  }

  private decodeClassWithId(): ClassRecord {
    const objectId = this.reader.readInt32();
    const metadataId = this.reader.readInt32();
    
    const metadata = this.metadataMap.get(metadataId);
    if (!metadata) {
      throw new Error(`Metadata not found for ID ${metadataId}`);
    }
    
    const classInfo: ClassInfo = {
      objectId,
      name: metadata.classInfo.name,
      memberCount: metadata.classInfo.memberCount,
      memberNames: metadata.classInfo.memberNames
    };
    
    const record = new ClassRecord(classInfo, metadata.memberTypeInfo, metadata.libraryId, RecordType.ClassWithId);
    this.recordMap.set(objectId, record);
    
    if (metadata.memberTypeInfo) {
      this.readMemberValues(record, classInfo.memberNames, metadata.memberTypeInfo);
    } else {
      for (const memberName of classInfo.memberNames) {
        const value = this.decodeNext();
        record.memberValues.set(memberName, value);
      }
    }
    
    return record;
  }

  private readMemberValues(record: ClassRecord, memberNames: string[], memberTypeInfo: MemberTypeInfo): void {
    for (let i = 0; i < memberNames.length; i++) {
      const memberName = memberNames[i];
      const binaryType = memberTypeInfo.binaryTypeEnums[i];
      const additionalInfo = memberTypeInfo.additionalInfos[i];
      
      const value = this.readObjectValue(binaryType, additionalInfo);
      record.memberValues.set(memberName, value);
    }
  }

  private readObjectValue(binaryType: BinaryType, additionalInfo: AdditionalTypeInfo): ObjectValue {
    if (binaryType === BinaryType.Primitive && additionalInfo.type === 'Primitive') {
      return this.readPrimitiveValue(additionalInfo.primitiveType);
    } else {
      return this.decodeNext();
    }
  }

  private readPrimitiveValue(primitiveType: PrimitiveType): PrimitiveValue {
    switch (primitiveType) {
      case PrimitiveType.Boolean:
        return this.reader.readBoolean();
      
      case PrimitiveType.Byte:
        return this.reader.readByte();
      
      case PrimitiveType.SByte:
        return this.reader.readSByte();
      
      case PrimitiveType.Char:
        return this.reader.readChar();
      
      case PrimitiveType.Int16:
        return this.reader.readInt16();
      
      case PrimitiveType.UInt16:
        return this.reader.readUInt16();
      
      case PrimitiveType.Int32:
        return this.reader.readInt32();
      
      case PrimitiveType.UInt32:
        return this.reader.readUInt32();
      
      case PrimitiveType.Int64:
        return Number(this.reader.readInt64());
      
      case PrimitiveType.UInt64:
        return Number(this.reader.readUInt64());
      
      case PrimitiveType.Single:
        return this.reader.readSingle();
      
      case PrimitiveType.Double:
        return this.reader.readDouble();
      
      case PrimitiveType.Decimal:
        return this.reader.readDecimal();
      
      case PrimitiveType.DateTime:
        return Number(this.reader.readDateTime());
      
      case PrimitiveType.TimeSpan:
        return Number(this.reader.readTimeSpan());
      
      case PrimitiveType.String:
        return this.reader.readLengthPrefixedString();
      
      case PrimitiveType.Null:
        return null;
      
      default:
        throw new Error(`Unsupported primitive type: ${primitiveType}`);
    }
  }

  private decodeBinaryObjectString(): BinaryObjectStringRecord {
    const objectId = this.reader.readInt32();
    const value = this.reader.readLengthPrefixedString();
    
    const record = new BinaryObjectStringRecord(objectId, value);
    this.recordMap.set(objectId, record);
    
    return record;
  }

  private decodeBinaryArray(): BinaryArrayRecord {
    const objectId = this.reader.readInt32();
    const binaryArrayTypeEnum = this.reader.readByte() as BinaryArrayType;
    const rank = this.reader.readInt32();
    
    const lengths: number[] = [];
    for (let i = 0; i < rank; i++) {
      lengths.push(this.reader.readInt32());
    }
    
    let lowerBounds: number[] | null = null;
    if (binaryArrayTypeEnum === BinaryArrayType.SingleOffset || 
        binaryArrayTypeEnum === BinaryArrayType.JaggedOffset || 
        binaryArrayTypeEnum === BinaryArrayType.RectangularOffset) {
      lowerBounds = [];
      for (let i = 0; i < rank; i++) {
        lowerBounds.push(this.reader.readInt32());
      }
    }
    
    const typeEnum: BinaryType = this.reader.readByte();
    const additionalTypeInfo = this.readAdditionalTypeInfo(typeEnum);
    
    const totalElements = lengths.reduce((a, b) => a * b, 1);
    const elementValues = this.readAllElements(totalElements, typeEnum, additionalTypeInfo);
    
    const record = new BinaryArrayRecord(
      objectId,
      binaryArrayTypeEnum,
      rank,
      lengths,
      lowerBounds,
      typeEnum,
      additionalTypeInfo,
      elementValues
    );
    
    this.recordMap.set(objectId, record);
    return record;
  }

  private readAdditionalTypeInfo(binaryType: BinaryType): AdditionalTypeInfo {
    switch (binaryType) {
      case BinaryType.Primitive:
        return {
          type: 'Primitive',
          primitiveType: this.reader.readByte()
        };
      
      case BinaryType.SystemClass:
        return {
          type: 'SystemClass',
          className: this.reader.readLengthPrefixedString()
        };
      
      case BinaryType.Class:
        return {
          type: 'Class',
          className: this.reader.readLengthPrefixedString(),
          libraryId: this.reader.readInt32()
        };
      
      default:
        return { type: 'None' };
    }
  }

  private readAllElements(count: number, binaryType: BinaryType, additionalInfo: AdditionalTypeInfo): ObjectValue[] {
    const elements: ObjectValue[] = [];
    let i = 0;
    
    while (i < count) {
      const val = this.readObjectValue(binaryType, additionalInfo);
      
      if (val instanceof ObjectNullMultipleRecord) {
        for (let j = 0; j < val.nullCount; j++) {
          elements.push(null);
        }
        i += val.nullCount;
        continue;
      } else if (val instanceof ObjectNullMultiple256Record) {
        for (let j = 0; j < val.nullCount; j++) {
          elements.push(null);
        }
        i += val.nullCount;
        continue;
      } else if (val instanceof ObjectNullRecord) {
        elements.push(null);
      } else {
        elements.push(val);
      }
      
      i++;
    }
    
    return elements;
  }

  private decodeArraySinglePrimitive(): ArraySinglePrimitiveRecord {
    const objectId = this.reader.readInt32();
    const length = this.reader.readInt32();
    const primitiveTypeEnum: PrimitiveType = this.reader.readByte();
    
    const elements: PrimitiveValue[] = [];
    for (let i = 0; i < length; i++) {
      elements.push(this.readPrimitiveValue(primitiveTypeEnum));
    }
    
    const record = new ArraySinglePrimitiveRecord(objectId, length, primitiveTypeEnum, elements);
    this.recordMap.set(objectId, record);
    return record;
  }

  private decodeArraySingleObject(): ArraySingleObjectRecord {
    const objectId = this.reader.readInt32();
    const length = this.reader.readInt32();
    
    const elements = this.readAllElements(length, BinaryType.Object, { type: 'None' });
    
    const record = new ArraySingleObjectRecord(objectId, length, elements);
    this.recordMap.set(objectId, record);
    return record;
  }

  private decodeArraySingleString(): ArraySingleStringRecord {
    const objectId = this.reader.readInt32();
    const length = this.reader.readInt32();
    
    const elements = this.readAllElements(length, BinaryType.String, { type: 'None' });
    
    const record = new ArraySingleStringRecord(objectId, length, elements);
    this.recordMap.set(objectId, record);
    return record;
  }

  private decodeMemberPrimitiveTyped(): MemberPrimitiveTypedRecord {
    const primitiveTypeEnum: PrimitiveType = this.reader.readByte();
    const value = this.readPrimitiveValue(primitiveTypeEnum);
    
    return new MemberPrimitiveTypedRecord(primitiveTypeEnum, value);
  }

  private decodeMemberReference(): MemberReferenceRecord {
    const idRef = this.reader.readInt32();
    
    this.log(`      idRef=${idRef}`);
    
    // DON'T validate the reference here - it might be a forward reference
    // The record map will be populated as we continue decoding
    // References will be resolved when actually needed
    
    return new MemberReferenceRecord(idRef);
  }

  resolveReference(ref: MemberReferenceRecord): NrbfRecord {
    const record = this.recordMap.get(ref.idRef);
    if (!record) {
      throw new Error(`Cannot resolve reference to ID ${ref.idRef}`);
    }
    return record;
  }

  private decodeObjectNullMultiple(): ObjectNullMultipleRecord {
    const nullCount = this.reader.readInt32();
    this.log(`      nullCount=${nullCount}`);
    return new ObjectNullMultipleRecord(nullCount);
  }

  private decodeObjectNullMultiple256(): ObjectNullMultiple256Record {
    const nullCount = this.reader.readByte();
    this.log(`      nullCount=${nullCount}`);
    return new ObjectNullMultiple256Record(nullCount);
  }

  getRecord(objectId: number): NrbfRecord | undefined {
    return this.recordMap.get(objectId);
  }

  getAllRecords(): Map<number, NrbfRecord> {
    return this.recordMap;
  }

  getLibraries(): Map<number, string> {
    return this.libraryMap;
  }
}

/**
 * NRBF Encoder
 */
export class NrbfEncoder {
  private writer = new BinaryWriter();
  private writtenRecords = new Set<number>();

  encode(root: NrbfRecord, rootId?: number): ArrayBuffer {
    const actualRootId = rootId ?? root.objectId ?? 1;
    
    // Write header
    this.writer.writeByte(RecordType.SerializedStreamHeader);
    this.writer.writeInt32(actualRootId);
    this.writer.writeInt32(-1);
    this.writer.writeInt32(1);
    this.writer.writeInt32(0);
    
    // Write root record
    this.encodeRecord(root);
    
    // Write MessageEnd
    this.writer.writeByte(RecordType.MessageEnd);
    
    return this.writer.toBuffer();
  }

  private encodeRecord(record: NrbfRecord): void {
    if (record.objectId && this.writtenRecords.has(record.objectId)) {
      return;
    }
    
    if (record instanceof ClassRecord) {
      this.encodeClassRecord(record);
    } else if (record instanceof BinaryArrayRecord) {
      this.encodeBinaryArrayRecord(record);
    } else if (record instanceof ArraySinglePrimitiveRecord) {
      this.encodeArraySinglePrimitive(record);
    } else if (record instanceof ArraySingleObjectRecord) {
      this.encodeArraySingleObject(record);
    } else if (record instanceof ArraySingleStringRecord) {
      this.encodeArraySingleString(record);
    } else if (record instanceof BinaryObjectStringRecord) {
      this.encodeBinaryObjectString(record);
    } else if (record instanceof BinaryLibrary) {
      this.encodeBinaryLibrary(record);
    } else if (record instanceof MemberPrimitiveTypedRecord) {
      this.encodeMemberPrimitiveTyped(record);
    } else if (record instanceof MemberReferenceRecord) {
      this.encodeMemberReference(record);
    } else if (record instanceof ObjectNullRecord) {
      this.writer.writeByte(RecordType.ObjectNull);
    } else if (record instanceof ObjectNullMultipleRecord) {
      this.encodeObjectNullMultiple(record);
    } else if (record instanceof ObjectNullMultiple256Record) {
      this.encodeObjectNullMultiple256(record);
    }
    
    if (record.objectId) {
      this.writtenRecords.add(record.objectId);
    }
  }

  private encodeClassRecord(record: ClassRecord): void {
    const rt = record.recordType;
    
    this.writer.writeByte(rt);
    this.writeClassInfo(record.classInfo);
    
    if (rt === RecordType.ClassWithMembersAndTypes || rt === RecordType.SystemClassWithMembersAndTypes) {
      this.writeMemberTypeInfo(record.memberTypeInfo!);
    }
    
    if (rt === RecordType.ClassWithMembersAndTypes || rt === RecordType.ClassWithMembers) {
      this.writer.writeInt32(record.libraryId!);
    }
    
    for (const memberName of record.classInfo.memberNames) {
      const value = record.memberValues.get(memberName);
      this.writeObjectValue(value);
    }
  }

  private writeClassInfo(classInfo: ClassInfo): void {
    this.writer.writeInt32(classInfo.objectId);
    this.writer.writeLengthPrefixedString(classInfo.name);
    this.writer.writeInt32(classInfo.memberCount);
    
    for (const memberName of classInfo.memberNames) {
      this.writer.writeLengthPrefixedString(memberName);
    }
  }

  private writeMemberTypeInfo(memberTypeInfo: MemberTypeInfo): void {
    for (const bt of memberTypeInfo.binaryTypeEnums) {
      this.writer.writeByte(bt);
    }
    
    for (const info of memberTypeInfo.additionalInfos) {
      if (info.type === 'Primitive') {
        this.writer.writeByte(info.primitiveType);
      } else if (info.type === 'SystemClass') {
        this.writer.writeLengthPrefixedString(info.className);
      } else if (info.type === 'Class') {
        this.writer.writeLengthPrefixedString(info.className);
        this.writer.writeInt32(info.libraryId);
      }
    }
  }

  private encodeBinaryArrayRecord(record: BinaryArrayRecord): void {
    this.writer.writeByte(RecordType.BinaryArray);
    this.writer.writeInt32(record.arrayObjectId);
    this.writer.writeByte(record.binaryArrayTypeEnum);
    this.writer.writeInt32(record.rank);
    
    for (const length of record.lengths) {
      this.writer.writeInt32(length);
    }
    
    if (record.lowerBounds) {
      for (const bound of record.lowerBounds) {
        this.writer.writeInt32(bound);
      }
    }
    
    this.writer.writeByte(record.typeEnum);
    this.writeAdditionalTypeInfo(record.additionalTypeInfo);
    
    for (const element of record.elementValues) {
      this.writeObjectValue(element);
    }
  }

  private writeAdditionalTypeInfo(info: AdditionalTypeInfo): void {
    if (info.type === 'Primitive') {
      this.writer.writeByte(info.primitiveType);
    } else if (info.type === 'SystemClass') {
      this.writer.writeLengthPrefixedString(info.className);
    } else if (info.type === 'Class') {
      this.writer.writeLengthPrefixedString(info.className);
      this.writer.writeInt32(info.libraryId);
    }
  }

  private encodeArraySinglePrimitive(record: ArraySinglePrimitiveRecord): void {
    this.writer.writeByte(RecordType.ArraySinglePrimitive);
    this.writer.writeInt32(record.arrayObjectId);
    this.writer.writeInt32(record.length);
    this.writer.writeByte(record.primitiveTypeEnum);
    
    for (const element of record.elementValues) {
      this.writePrimitiveValue(element, record.primitiveTypeEnum);
    }
  }

  private encodeArraySingleObject(record: ArraySingleObjectRecord): void {
    this.writer.writeByte(RecordType.ArraySingleObject);
    this.writer.writeInt32(record.arrayObjectId);
    this.writer.writeInt32(record.length);
    
    for (const element of record.elementValues) {
      this.writeObjectValue(element);
    }
  }

  private encodeArraySingleString(record: ArraySingleStringRecord): void {
    this.writer.writeByte(RecordType.ArraySingleString);
    this.writer.writeInt32(record.arrayObjectId);
    this.writer.writeInt32(record.length);
    
    for (const element of record.elementValues) {
      this.writeObjectValue(element);
    }
  }

  private encodeBinaryObjectString(record: BinaryObjectStringRecord): void {
    this.writer.writeByte(RecordType.BinaryObjectString);
    this.writer.writeInt32(record.stringObjectId);
    this.writer.writeLengthPrefixedString(record.value);
  }

  private encodeBinaryLibrary(record: BinaryLibrary): void {
    this.writer.writeByte(RecordType.BinaryLibrary);
    this.writer.writeInt32(record.libraryId);
    this.writer.writeLengthPrefixedString(record.libraryName);
  }

  private encodeMemberPrimitiveTyped(record: MemberPrimitiveTypedRecord): void {
    this.writer.writeByte(RecordType.MemberPrimitiveTyped);
    this.writer.writeByte(record.primitiveTypeEnum);
    this.writePrimitiveValue(record.value, record.primitiveTypeEnum);
  }

  private encodeMemberReference(record: MemberReferenceRecord): void {
    this.writer.writeByte(RecordType.MemberReference);
    this.writer.writeInt32(record.idRef);
  }

  private encodeObjectNullMultiple(record: ObjectNullMultipleRecord): void {
    this.writer.writeByte(RecordType.ObjectNullMultiple);
    this.writer.writeInt32(record.nullCount);
  }

  private encodeObjectNullMultiple256(record: ObjectNullMultiple256Record): void {
    this.writer.writeByte(RecordType.ObjectNullMultiple256);
    this.writer.writeByte(record.nullCount);
  }

  private writeObjectValue(value: ObjectValue | undefined): void {
    if (value === null || value === undefined) {
      this.writer.writeByte(RecordType.ObjectNull);
    } else if (value instanceof NrbfRecord) {
      this.encodeRecord(value);
    } else {
      // Direct primitive value - write it inline (used in arrays)
      // Determine type and write
      if (typeof value === 'boolean') {
        this.writer.writeBoolean(value);
      } else if (typeof value === 'number') {
        // Ambiguous - caller should use proper typed arrays
        throw new Error('Cannot encode bare number - use typed array records');
      } else if (typeof value === 'string') {
        // In array context, strings should be BinaryObjectString
        throw new Error('Cannot encode bare string - wrap in BinaryObjectStringRecord');
      }
    }
  }

  private writePrimitiveValue(value: PrimitiveValue, type: PrimitiveType): void {
    if (value === null) {
      return;
    }
    
    switch (type) {
      case PrimitiveType.Boolean:
        this.writer.writeBoolean(value as boolean);
        break;
      
      case PrimitiveType.Byte:
        this.writer.writeByte(value as number);
        break;
      
      case PrimitiveType.SByte:
        this.writer.writeSByte(value as number);
        break;
      
      case PrimitiveType.Char:
        this.writer.writeChar(value as string);
        break;
      
      case PrimitiveType.Int16:
        this.writer.writeInt16(value as number);
        break;
      
      case PrimitiveType.UInt16:
        this.writer.writeUInt16(value as number);
        break;
      
      case PrimitiveType.Int32:
        this.writer.writeInt32(value as number);
        break;
      
      case PrimitiveType.UInt32:
        this.writer.writeUInt32(value as number);
        break;
      
      case PrimitiveType.Int64:
        this.writer.writeInt64(BigInt(value as number));
        break;
      
      case PrimitiveType.UInt64:
        this.writer.writeUInt64(BigInt(value as number));
        break;
      
      case PrimitiveType.Single:
        this.writer.writeSingle(value as number);
        break;
      
      case PrimitiveType.Double:
        this.writer.writeDouble(value as number);
        break;
      
      case PrimitiveType.Decimal:
        this.writer.writeDecimal(value as string);
        break;
      
      case PrimitiveType.DateTime:
        this.writer.writeDateTime(BigInt(value as number));
        break;
      
      case PrimitiveType.TimeSpan:
        this.writer.writeTimeSpan(BigInt(value as number));
        break;
      
      case PrimitiveType.String:
        this.writer.writeLengthPrefixedString(value as string);
        break;
    }
  }
}

/**
 * Utility functions
 */
export class NrbfUtils {
  static startsWithPayloadHeader(buffer: ArrayBuffer): boolean {
    if (buffer.byteLength < 17) {
      return false;
    }
    
    const view = new DataView(buffer);
    
    if (view.getUint8(0) !== RecordType.SerializedStreamHeader) {
      return false;
    }
    
    const expectedSuffix = [1, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 8; i++) {
      if (view.getUint8(9 + i) !== expectedSuffix[i]) {
        return false;
      }
    }
    
    return true;
  }

  static parseGuid(guidRecord: ClassRecord): string {
    return ClassRecord.reconstructGuid(guidRecord);
  }

  static createGuidRecord(objectId: number, guidString: string): ClassRecord {
    return ClassRecord.createGuidRecord(objectId, guidString);
  }

  static getNestedValue(record: NrbfRecord, path: string, decoder?: NrbfDecoder): ObjectValue | undefined {
    const parts = path.split('.');
    let current: any = record;
    
    for (const part of parts) {
      // Resolve references if we hit a MemberReferenceRecord
      if (current instanceof MemberReferenceRecord) {
        if (decoder) {
          current = decoder.getRecord(current.idRef);
          if (!current) {
            return undefined;
          }
        } else {
          return undefined;
        }
      }

      if (current instanceof ClassRecord) {
        current = current.getValue(part);
      } else if ((current instanceof ArraySingleObjectRecord || 
                  current instanceof ArraySinglePrimitiveRecord ||
                  current instanceof ArraySingleStringRecord ||
                  current instanceof BinaryArrayRecord) && !isNaN(Number(part))) {
        current = current.getArray()[Number(part)];
      } else {
        return undefined;
      }
      
      if (current === undefined || current === null) {
        return undefined;
      }
    }

    // Final resolution if we ended on a reference
    if (current instanceof MemberReferenceRecord && decoder) {
      current = decoder.getRecord(current.idRef);
    }
    
    return current;
  }

  static findGuidInBinary(buffer: ArrayBuffer, guidString: string): number[] {
    const hex = guidString.replace(/-/g, '');
    const pattern = new Uint8Array(16);
    
    for (let i = 0; i < 16; i++) {
      pattern[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    
    const data = new Uint8Array(buffer);
    const matches: number[] = [];
    
    for (let i = 0; i <= data.length - pattern.length; i++) {
      let match = true;
      for (let j = 0; j < pattern.length; j++) {
        if (data[i + j] !== pattern[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        matches.push(i);
      }
    }
    
    return matches;
  }

  static replaceGuidAtOffset(buffer: ArrayBuffer, offset: number, newGuidString: string): ArrayBuffer {
    const hex = newGuidString.replace(/-/g, '');
    const data = new Uint8Array(buffer.slice(0));
    
    for (let i = 0; i < 16; i++) {
      data[offset + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    
    return data.buffer;
  }
}

export {
  RecordType,
  BinaryType,
  PrimitiveType,
  BinaryArrayType,
  NrbfRecord,
  SerializationHeader,
  BinaryLibrary,
  ClassRecord,
  BinaryArrayRecord,
  ArraySinglePrimitiveRecord,
  ArraySingleObjectRecord,
  ArraySingleStringRecord,
  BinaryObjectStringRecord,
  MemberPrimitiveTypedRecord,
  MemberReferenceRecord,
  ObjectNullRecord,
  ObjectNullMultipleRecord,
  ObjectNullMultiple256Record,
  MessageEndRecord,
  // NrbfDecoder,
  // NrbfEncoder,
  // NrbfUtils,
};

// Export types
export type {
  ObjectValue,
  PrimitiveValue,
  ClassInfo,
  MemberTypeInfo,
  AdditionalTypeInfo,
  ClassTypeInfo,
  // CliOptions,
};