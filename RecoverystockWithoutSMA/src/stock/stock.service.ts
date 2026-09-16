import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { RecoveryResult } from '../entities/recovery-result.entity';
import { PriceAlertEntity } from '../entities/price-alert.entity';

@Injectable()
export class StockService {
  constructor(
    private readonly dataSource: DataSource,

    @InjectRepository(PriceAlertEntity)
    private readonly stockRepository: Repository<PriceAlertEntity>,

    @InjectRepository(RecoveryResult)
    private readonly recoveryResultRepository: Repository<RecoveryResult>,
  ) {}

  async processRecoveryStocks(periodMonths: number) {
    if (periodMonths !== 3 && periodMonths !== 6) {
      throw new BadRequestException('กรุณากรอกช่วงเวลาให้ถูกต้อง (รองรับเฉพาะ 3 หรือ 6 เดือนเท่านั้น)');
    }

    const symbols = ['MSFT', 'NVDA', 'LLY', 'JNJ', 'JPM', 'V', 'AMZN', 'DIS', 'XOM', 'CVX'];
    const todayStr = new Date().toISOString().split('T')[0];

    const existingResults = await this.recoveryResultRepository.find({
      where: {
        analysisDate: todayStr,
        periodMonths,
      },
    });

    if (existingResults.length > 0) {
      return {
        message: `ผลการวิเคราะห์หุ้นฟื้นตัวของวันที่ ${todayStr} มีอยู่แล้ว`,
        totalAnalyzed: existingResults.length,
        totalPassed: existingResults.filter(r => r.isPassed).length,
        data: existingResults,
      };
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const allAnalyzedResults: RecoveryResult[] = [];
      let passedCount = 0;

      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() - periodMonths);
      const targetDateStr = targetDate.toISOString().split('T')[0];

      for (const symbol of symbols) {
        const prices = await queryRunner.manager
          .createQueryBuilder(PriceAlertEntity, 's')
          .where('s.symbol = :symbol', { symbol })
          .andWhere('s.price_date >= :targetDateStr', { targetDateStr })
          .orderBy('s.price_date', 'ASC')
          .getMany();

        if (!prices || prices.length === 0) {
          const recoveryEntity = queryRunner.manager.create(RecoveryResult, {
            symbol,
            analysisDate: todayStr,
            currentPrice: 0,
            highestPrice: 0,
            lowestPrice: 0,
            avgVolume20: 0,
            sma50: 0,
            volume: 0,
            periodMonths,
            isPassed: false,
            reason: 'ไม่ผ่านเกณฑ์: ไม่พบข้อมูลราคาหุ้นในช่วงเวลานี้',
          });

          const saved = await queryRunner.manager.save(recoveryEntity);
          allAnalyzedResults.push(saved);
          continue;
        }

        const validPrices = prices
          .filter(p => p.eod_price !== null && p.eod_price !== undefined)
          .map(p => ({
            close: Number(p.eod_price),
            volume: Number(p.volume || 0),
          }));

        if (validPrices.length < 50) {
          const recoveryEntity = queryRunner.manager.create(RecoveryResult, {
            symbol,
            analysisDate: todayStr,
            currentPrice: validPrices.length > 0 ? validPrices[validPrices.length - 1].close : 0,
            highestPrice: validPrices.length > 0 ? Math.max(...validPrices.map(p => p.close)) : 0,
            lowestPrice: validPrices.length > 0 ? Math.min(...validPrices.map(p => p.close)) : 0,
            avgVolume20: 0,
            sma50: 0,
            volume: validPrices.length > 0 ? validPrices[validPrices.length - 1].volume : 0,
            periodMonths,
            isPassed: false,
            reason: 'ไม่ผ่านเกณฑ์: ข้อมูลไม่เพียงพอสำหรับการวิเคราะห์ ',
          });

          const saved = await queryRunner.manager.save(recoveryEntity);
          allAnalyzedResults.push(saved);
          continue;
        }

        const currentData = validPrices[validPrices.length - 1];
        const currentPrice = currentData.close;
        const currentVolume = currentData.volume;

        const closes = validPrices.map(p => p.close);
        const highestPrice = Math.max(...closes);
        const lowestPrice = Math.min(...closes);

        const last20Volumes = validPrices.slice(-20).map(p => p.volume);
        const avgVolume20 = last20Volumes.reduce((a, b) => a + b, 0) / last20Volumes.length;

        const last50Closes = validPrices.slice(-50).map(p => p.close);
        const sma50 = last50Closes.reduce((a, b) => a + b, 0) / last50Closes.length;

        const dropFromHigh = (highestPrice - currentPrice) / highestPrice >= 0.20;
        const recoveryFromLow = (currentPrice - lowestPrice) / lowestPrice >= 0.10;
        const volumeCondition = currentVolume > avgVolume20;
        const smaCondition = currentPrice > sma50;

        const isPassed = dropFromHigh && recoveryFromLow && volumeCondition && smaCondition;

        let reason = 'ผ่านเกณฑ์หุ้นฟื้นทั้งหมด';
        if (!isPassed) {
          const failedCriteria: string[] = [];
          if (!dropFromHigh) failedCriteria.push('ราคาตกจากจุดสูงสุดยังไม่ถึง 20%');
          if (!recoveryFromLow) failedCriteria.push('การฟื้นตัวจากจุดต่ำสุดยังไม่ถึง 10%');
          if (!volumeCondition) failedCriteria.push('ปริมาณการซื้อขายรายวันน้อยกว่าค่าเฉลี่ยปริมาณการซื้อขายย้อนหลัง 20 วัน');
          if (!smaCondition) failedCriteria.push('ราคาปิดปัจจุบันต่ำกว่าเส้น SMA50');

          reason = `ไม่ผ่านเกณฑ์: ${failedCriteria.join(', ')}`;
        }

        if (isPassed) {
          passedCount++;
        }

        const recoveryEntity = queryRunner.manager.create(RecoveryResult, {
          symbol,
          analysisDate: todayStr,
          currentPrice,
          highestPrice,
          lowestPrice,
          avgVolume20,
          sma50,
          volume: currentVolume,
          periodMonths,
          isPassed,
          reason,
        });

        const saved = await queryRunner.manager.save(recoveryEntity);
        allAnalyzedResults.push(saved);
      }

      await queryRunner.commitTransaction();

      return {
        message: `วิเคราะห์หุ้นฟื้นตัวสำเร็จสำหรับช่วงเวลา ${periodMonths} เดือน และบันทึกข้อมูลทั้งหมดเรียบร้อยแล้ว`,
        totalAnalyzed: allAnalyzedResults.length,
        totalPassed: passedCount,
        data: allAnalyzedResults,
      };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('--- REAL ERROR DETAIL ---', error);
      throw new InternalServerErrorException(
        'เกิดข้อผิดพลาดในระบบ ไม่สามารถดำเนินงานได้',
      );
    } finally {
      await queryRunner.release();
    }
  }
}