import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('price_alert_stocks')
export class PriceAlertEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  symbol: string;

  @Column()
  name: string;

  @Column()
  industry: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  eod_price: number | null; // เพิ่ม | null

  @Column({ type: 'date', nullable: true })
  price_date: string;

  @Column({ type: 'decimal', precision: 20, scale: 2, nullable: true })
  market_cap: number | null; // เพิ่ม | null

  @Column({ type: 'timestamp', nullable: true })
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  updated_at: Date;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  open: number | null; // เพิ่ม | null

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  high: number | null; // เพิ่ม | null

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  low: number | null; // เพิ่ม | null

  @Column({ type: 'bigint', nullable: true })
  volume: number | null; // เพิ่ม | null
}