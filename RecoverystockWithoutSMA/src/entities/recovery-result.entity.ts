import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('recovery_results')
export class RecoveryResult {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  symbol: string;

  @Column({ type: 'date' })
  analysisDate: string;

  @Column({ type: 'float' })
  currentPrice: number;

  @Column({ type: 'float', nullable: true })
  highestPrice: number;

  @Column({ type: 'float', nullable: true })
  lowestPrice: number;

  @Column({ type: 'float', nullable: true })
  avgVolume20: number;

  @Column({ type: 'float' })
  sma50: number;

  @Column({ type: 'float' })
  volume: number;

  @Column({ type: 'int', nullable: true })
  periodMonths: number;

  @Column()
  isPassed: boolean;

 
  @Column({ type: 'text' })
  reason: string;

  @CreateDateColumn()
  createdAt: Date;
}