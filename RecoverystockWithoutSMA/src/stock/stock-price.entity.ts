import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('stock_price')
export class StockPrice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  symbol: string;

  @Column({ nullable: true })
  industry: string;

  @Column()
  date: string; 

  @Column({ type: 'float', nullable: true })
  open?: number | null;

  @Column({ type: 'float', nullable: true })
  high?: number | null;

  @Column({ type: 'float', nullable: true })
  low?: number | null;

  @Column({ type: 'float', nullable: true })
  close?: number | null;

  @Column({ type: 'bigint', nullable: true })
  volume?: number | null;
}