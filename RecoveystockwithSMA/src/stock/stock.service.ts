import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { RecoveryResult } from '../entities/recovery-result.entity';
import { PriceAlertEntity } from '../entities/price-alert.entity';
import { SmaRecord } from '../entities/sma-record.entity';
import { SmaService } from '../SMA_core _calculator/src/sma/sma.service';

@Injectable()
export class StockService {
  constructor(
    private readonly dataSource: DataSource,

    @InjectRepository(PriceAlertEntity)
    private readonly stockRepository: Repository<PriceAlertEntity>,

    @InjectRepository(RecoveryResult)
    private readonly recoveryResultRepository: Repository<RecoveryResult>,

    @InjectRepository(SmaRecord)
    private readonly smaRecordRepository: Repository<SmaRecord>,
    private readonly smaService: SmaService,
  ) { }

  async processRecoveryStocks(periodMonths: number) {
    if (periodMonths !== 3 && periodMonths !== 6) {
      throw new BadRequestException('กรุณากรอกช่วงเวลาให้ถูกต้อง (รองรับเฉพาะ 3 หรือ 6 เดือนเท่านั้น)');
    }

    const symbols = ['MSFT', 'NVDA', 'LLY', 'JNJ', 'JPM', 'V', 'AMZN', 'DIS', 'XOM', 'CVX'];
    const todayStr = new Date().toISOString().split('T')[0];

    const saveOrUpdateResult = async (
      manager: any,
      symbol: string,
      data: {
        currentPrice: number;
        highestPrice: number;
        lowestPrice: number;
        avgVolume20: number;
        sma50: number;
        volume: number;
        isPassed: boolean;
        reason: string;
      }
    ) => {
      let recoveryEntity = await manager.findOne(RecoveryResult, {
        where: {
          symbol: symbol,
          analysisDate: todayStr,
          periodMonths: Number(periodMonths)
        },
      });

      let status: 'exists' | 'updated' | 'created' = 'created';

      if (recoveryEntity) {
        const isSame =
          recoveryEntity.isPassed === data.isPassed &&
          Number(recoveryEntity.sma50) === Number(data.sma50) &&
          recoveryEntity.reason === data.reason &&
          Number(recoveryEntity.currentPrice) === Number(data.currentPrice);

        if (isSame) {
          
          return { entity: recoveryEntity, status: 'exists' as const };
        }

        
        recoveryEntity.currentPrice = data.currentPrice;
        recoveryEntity.highestPrice = data.highestPrice;
        recoveryEntity.lowestPrice = data.lowestPrice;
        recoveryEntity.avgVolume20 = data.avgVolume20;
        recoveryEntity.sma50 = data.sma50;
        recoveryEntity.volume = data.volume;
        recoveryEntity.isPassed = data.isPassed;
        recoveryEntity.reason = data.reason;

        status = 'updated';
      } else {
        recoveryEntity = manager.create(RecoveryResult, {
          symbol,
          analysisDate: todayStr,
          periodMonths: Number(periodMonths),
          ...data,
        });
        status = 'created';
      }

      const savedEntity = await manager.save(recoveryEntity);
      return { entity: savedEntity, status };
    };

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const allAnalyzedResults: RecoveryResult[] = [];
      let passedCount = 0;
      let hasUpdated = false;
      let hasExists = false;

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
          const result = await saveOrUpdateResult(queryRunner.manager, symbol, {
            currentPrice: 0,
            highestPrice: 0,
            lowestPrice: 0,
            avgVolume20: 0,
            sma50: 0,
            volume: 0,
            isPassed: false,
            reason: 'ไม่ผ่านเกณฑ์: ไม่พบข้อมูลราคาหุ้นในฐานข้อมูลช่วงเวลานี้',
          });

          allAnalyzedResults.push(result.entity);
          if (result.entity.isPassed) passedCount++;
          if (result.status === 'updated') hasUpdated = true;
          if (result.status === 'exists') hasExists = true;
          continue;
        }

        const validPrices = prices
          .filter(p => p.eod_price !== null && p.eod_price !== undefined)
          .map(p => ({
            close: Number(p.eod_price),
            volume: Number(p.volume || 0),
          }));

        if (validPrices.length < 50) {
          const lastPrice = validPrices.length > 0 ? validPrices[validPrices.length - 1].close : 0;
          const lastVol = validPrices.length > 0 ? validPrices[validPrices.length - 1].volume : 0;

          const result = await saveOrUpdateResult(queryRunner.manager, symbol, {
            currentPrice: lastPrice,
            highestPrice: validPrices.length > 0 ? Math.max(...validPrices.map(p => p.close)) : 0,
            lowestPrice: validPrices.length > 0 ? Math.min(...validPrices.map(p => p.close)) : 0,
            avgVolume20: 0,
            sma50: 0,
            volume: lastVol,
            isPassed: false,
            reason: `ไม่ผ่านเกณฑ์: ข้อมูลราคาในฐานข้อมูลไม่เพียงพอสำหรับการวิเคราะห์ (มีเพียง ${validPrices.length} วัน ต้องการอย่างน้อย 50 วัน)`,
          });

          allAnalyzedResults.push(result.entity);
          if (result.entity.isPassed) passedCount++;
          if (result.status === 'updated') hasUpdated = true;
          if (result.status === 'exists') hasExists = true;
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

        const period = 50;
        let smaRecord = await queryRunner.manager.findOne(SmaRecord, {
          where: { symbol, period },
          order: { calculatedAt: 'DESC' },
        });

        if (!smaRecord) {
          try {
            await this.smaService.processSmaRequest({ symbol, period });

            smaRecord = await queryRunner.manager.findOne(SmaRecord, {
              where: { symbol, period },
              order: { calculatedAt: 'DESC' },
            });
          } catch (error) {
            console.error(`ไม่สามารถคำนวณ SMA สำหรับ ${symbol} ได้:`, error);
          }
        }

        if (!smaRecord) {
          const result = await saveOrUpdateResult(queryRunner.manager, symbol, {
            currentPrice,
            highestPrice,
            lowestPrice,
            avgVolume20,
            sma50: 0,
            volume: currentVolume,
            isPassed: false,
            reason: 'ไม่ผ่านเกณฑ์: ไม่พบข้อมูลหรือคำนวณค่า SMA 50 ในฐานข้อมูลไม่สำเร็จ',
          });

          allAnalyzedResults.push(result.entity);
          if (result.entity.isPassed) passedCount++;
          if (result.status === 'updated') hasUpdated = true;
          if (result.status === 'exists') hasExists = true;
          continue;
        }

        const sma50 = Number(smaRecord.smaValue);
        //const sma50=0;
        
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


          if (currentPrice === 0) failedCriteria.push('ข้อมูลราคาปัจจุบันไม่เพียงพอสำหรับการคำนวณ');
          if (highestPrice === 0) failedCriteria.push('ข้อมูลราคาสูงสุดไม่เพียงพอสำหรับการคำนวณ');
          if (lowestPrice === 0) failedCriteria.push('ข้อมูลราคาต่ำสุดไม่เพียงพอสำหรับการคำนวณ');
          if (avgVolume20 === 0) failedCriteria.push('ข้อมูลปริมาณการซื้อขายเฉลี่ย 20 วันไม่เพียงพอสำหรับการคำนวณ');
          if (currentVolume === 0) failedCriteria.push('ข้อมูลปริมาณการซื้อขายปัจจุบันไม่เพียงพอสำหรับการคำนวณ');
          if (sma50 === 0) failedCriteria.push('ข้อมูล SMA50 ไม่เพียงพอสำหรับการคำนวณ');

          reason = `ไม่ผ่านเกณฑ์: ${failedCriteria.join(', ')}`;
        }

        const result = await saveOrUpdateResult(queryRunner.manager, symbol, {
          currentPrice,
          highestPrice,
          lowestPrice,
          avgVolume20,
          sma50,
          volume: currentVolume,
          isPassed,
          reason,
        });

        allAnalyzedResults.push(result.entity);
        if (result.entity.isPassed) passedCount++;
        if (result.status === 'updated') hasUpdated = true;
        if (result.status === 'exists') hasExists = true;
      }

      await queryRunner.commitTransaction();


      let message = 'วิเคราะห์หุ้นฟื้นตัวสำเร็จเรียบร้อยแล้ว';
      if (hasUpdated) {
        message = 'อัปเดตข้อมูลในตารางแล้ว';
      } else if (hasExists) {
        message = 'มีข้อมูลในตารางแล้ว';
      }

      return {
        message,
        totalAnalyzed: allAnalyzedResults.length,
        totalPassed: passedCount,
        statusCode: 200,
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
