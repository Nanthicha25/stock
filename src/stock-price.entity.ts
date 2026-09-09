import { Entity, Column, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('stock_prices')
@Unique(['symbol', 'date'])
export class StockPrice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  symbol: string;

  @Column()
  industry: string;

  @Column({ type: 'date' })
  date: string;

  @Column('decimal', { precision: 10, scale: 2 })
  open: number;

  @Column('decimal', { precision: 10, scale: 2 })
  high: number;

  @Column('decimal', { precision: 10, scale: 2 })
  low: number;

  @Column('decimal', { precision: 10, scale: 2 })
  close: number;

  @Column('bigint')
  volume: number;
}