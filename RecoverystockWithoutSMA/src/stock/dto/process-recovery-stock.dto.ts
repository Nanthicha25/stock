import { IsIn, IsInt, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class ProcessRecoveryStockDto {
  @Type(() => Number) // แปลงค่า period ที่รับมาจาก URL (ซึ่งปกติเป็นตัวอักษร) ให้เป็นตัวเลข
  @IsInt({ message: '...' }) // ตรวจสอบว่าต้องเป็นจำนวนเต็มเท่านั้น
  @IsIn([3, 6], { message: '...' }) // ตรวจสอบว่าต้องเป็นเลข 3 หรือ 6 เท่านั้น
  @IsNotEmpty() // ห้ามส่งค่าว่างมา
  period: number; // ประกาศตัวแปร period รับค่าตัวเลข
}