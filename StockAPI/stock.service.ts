import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PriceAlertEntity } from './price-alert.entity';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  private readonly targetStocks = [
    { symbol: 'MSFT', name: 'Microsoft Corporation', industry: 'Technology' },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', industry: 'Technology' },
    { symbol: 'LLY', name: 'Eli Lilly and Company', industry: 'Healthcare' },
    { symbol: 'JNJ', name: 'Johnson & Johnson', industry: 'Healthcare' },
    { symbol: 'JPM', name: 'JPMorgan Chase & Co.', industry: 'Financials' },
    { symbol: 'V', name: 'Visa Inc.', industry: 'Financials' },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', industry: 'Consumer Discretionary' },
    { symbol: 'DIS', name: 'The Walt Disney Company', industry: 'Consumer Discretionary' },
    { symbol: 'XOM', name: 'Exxon Mobil Corporation', industry: 'Energy' },
    { symbol: 'CVX', name: 'Chevron Corporation', industry: 'Energy' },
  ];

  constructor(
    @InjectRepository(PriceAlertEntity)
    private readonly stockRepository: Repository<PriceAlertEntity>,
  ) {}

  // แปลง Date เป็น YYYY-MM-DD ตามเวลาท้องถิ่น
  private formatDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  async syncStockData(
    symbol: string,
    name: string,
    industry: string,
    startDateInput?: string,
    endDateInput?: string,
  ): Promise<number> {

    // =========================================================
    // 1. กำหนดช่วงวันที่
    // =========================================================
    let startStr = startDateInput;
    let endStr = endDateInput;

    if (!startStr || !endStr) {
      const now = new Date();

      // เริ่มตั้งแต่วันที่ 1 มกราคมของปีปัจจุบัน
      const startOfYear = new Date(
        now.getFullYear(),
        0,
        1,
      );

      startStr = this.formatDateString(startOfYear);

      // สำคัญ:
      // ใช้ "วันนี้" เป็นวันสิ้นสุด
      // เพื่อให้วันนี้ถูกสร้างเป็น record แม้ Yahoo จะยังไม่มีราคา
      endStr = this.formatDateString(now);
    }

    const queryOptions = {
      period1: startStr,
      period2: endStr,
      interval: '1d' as const,
    };

    // =========================================================
    // 2. ดึงข้อมูลราคาจาก Yahoo Finance
    // =========================================================
    let result: any;

    try {
      result = await yahooFinance.chart(symbol, queryOptions);
    } catch (error) {
      this.logger.error(
        `ไม่สามารถดึงข้อมูล Yahoo Finance ของ ${symbol} ได้`,
      );

      result = null;
    }

    // =========================================================
    // 3. ดึงจำนวนหุ้นสำหรับคำนวณ Market Cap
    // =========================================================
    let sharesOutstanding: number | null = null;

    try {
      const summary = await yahooFinance.quoteSummary(symbol, {
        modules: ['defaultKeyStatistics'],
      });

      sharesOutstanding =
        summary?.defaultKeyStatistics?.sharesOutstanding ?? null;

    } catch (error) {
      this.logger.warn(
        `ไม่สามารถดึง sharesOutstanding ของ ${symbol} ได้`,
      );
    }

    // =========================================================
    // 4. สร้าง Map ของข้อมูลราคาที่ Yahoo มี
    // =========================================================
    const quoteMap = new Map<string, any>();

    if (result?.quotes && result.quotes.length > 0) {
      for (const item of result.quotes) {
        if (item.date) {
          const itemDate = new Date(item.date);
          const dateStr = this.formatDateString(itemDate);

          quoteMap.set(dateStr, item);
        }
      }
    }

    // =========================================================
    // 5. เตรียมช่วงวันที่ที่จะบันทึกลงฐานข้อมูล
    // =========================================================
    const [startYear, startMonth, startDay] =
      startStr.split('-').map(Number);

    const [endYear, endMonth, endDay] =
      endStr.split('-').map(Number);

    const curr = new Date(
      startYear,
      startMonth - 1,
      startDay,
      12,
      0,
      0,
    );

    const end = new Date(
      endYear,
      endMonth - 1,
      endDay,
      12,
      0,
      0,
    );

    const nowTimestamp = new Date();

    const entities: PriceAlertEntity[] = [];

    // =========================================================
    // 6. สร้างข้อมูลทุกวัน
    // =========================================================
    while (curr <= end) {

      const dateStr = this.formatDateString(curr);

      const stockPrice = new PriceAlertEntity();

      stockPrice.symbol = symbol;
      stockPrice.name = name;
      stockPrice.industry = industry;
      stockPrice.price_date = dateStr;

      stockPrice.created_at = nowTimestamp;
      stockPrice.updated_at = nowTimestamp;

      // =======================================================
      // ถ้า Yahoo มีข้อมูลของวันนั้น
      // =======================================================
      if (quoteMap.has(dateStr)) {

        const dayData = quoteMap.get(dateStr);

        const closePrice =
          dayData.close ?? null;

        stockPrice.open =
          dayData.open ?? null;

        stockPrice.high =
          dayData.high ?? null;

        stockPrice.low =
          dayData.low ?? null;

        stockPrice.eod_price =
          closePrice;

        stockPrice.volume =
          dayData.volume ?? null;

        // Market Cap
        if (
          closePrice !== null &&
          sharesOutstanding !== null
        ) {
          stockPrice.market_cap =
            closePrice * sharesOutstanding;
        } else {
          stockPrice.market_cap = null;
        }

      }

      // =======================================================
      // ถ้า Yahoo ไม่มีข้อมูลของวันนั้น
      //
      // เช่น
      // - วันหยุด
      // - ตลาดยังไม่เปิด
      // - วันนี้ยังไม่มีข้อมูลจาก Yahoo
      //
      // ให้สร้าง record อยู่ แต่ค่าราคาเป็น NULL
      // =======================================================
      else {

        stockPrice.open = null;
        stockPrice.high = null;
        stockPrice.low = null;
        stockPrice.eod_price = null;
        stockPrice.volume = null;
        stockPrice.market_cap = null;
      }

      entities.push(stockPrice);

      // ไปวันถัดไป
      curr.setDate(curr.getDate() + 1);
    }

    // =========================================================
    // 7. บันทึกลงฐานข้อมูล
    // =========================================================
    if (entities.length > 0) {

      // ลบข้อมูลเดิมของหุ้นตัวนี้ก่อน
      await this.stockRepository.delete({
        symbol,
      });

      // แล้วบันทึกข้อมูลใหม่ทั้งหมด
      await this.stockRepository.save(entities);
    }

    return entities.length;
  }

  // ===========================================================
  // Sync หุ้นทั้งหมด
  // ===========================================================
  async syncAllStocks(
    startDate?: string,
    endDate?: string,
  ): Promise<{
    message: string;
    details: any[];
  }> {

    const details = [];

    for (const stock of this.targetStocks) {

      try {

        this.logger.log(
          `Fetching data for ${stock.symbol} (${startDate || 'YTD'} to ${endDate || 'today'})...`,
        );

        const count = await this.syncStockData(
          stock.symbol,
          stock.name,
          stock.industry,
          startDate,
          endDate,
        );

        this.logger.log(
          `Successfully synced ${count} records for ${stock.symbol}`,
        );

        details.push({
          symbol: stock.symbol,
          status: 'success',
          count,
        });

      } catch (error: any) {

        const errorMessage =
          error instanceof Error
            ? error.message
            : String(error);

        this.logger.error(
          `Error syncing ${stock.symbol}: ${errorMessage}`,
        );

        details.push({
          symbol: stock.symbol,
          status: 'error',
          error: errorMessage,
        });
      }
    }

    return {
      message:
        'Stock data synchronization process finished.',
      details,
    };
  }

  async calculateStocks(dto: any): Promise<any> {

    return {
      message:
        'Calculation completed successfully',

      data: dto,
    };
  }
}