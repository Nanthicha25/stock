import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { StockPrice } from './stock-price.entity';
import YahooFinance from 'yahoo-finance2';
import { CalculateStockDto } from './calculate-stock.dto';

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);
  private readonly yahooFinance = new YahooFinance();

  private readonly stockList = [
    { symbol: 'MSFT', industry: 'Technology' },
    { symbol: 'NVDA', industry: 'Technology' },
    { symbol: 'LLY', industry: 'Healthcare' },
    { symbol: 'JNJ', industry: 'Healthcare' },
    { symbol: 'JPM', industry: 'Financials' },
    { symbol: 'V', industry: 'Financials' },
    { symbol: 'AMZN', industry: 'Consumer Discretionary' },
    { symbol: 'DIS', industry: 'Consumer Discretionary' },
    { symbol: 'XOM', industry: 'Energy' },
    { symbol: 'CVX', industry: 'Energy' },
  ];

  constructor(
    @InjectRepository(StockPrice)
    private stockRepository: Repository<StockPrice>,
  ) {}

  @Cron('0 6 * * *')
  async handleCronSync() {
    this.logger.log('Starting daily scheduled stock sync...');
    await this.syncStockData();
  }

  async syncStockData() {
    for (const stock of this.stockList) {
      try {
        const latestRecord = await this.stockRepository.findOne({
          where: { symbol: stock.symbol },
          order: { date: 'DESC' },
        });

        let startDate: string;
        if (!latestRecord) {
          const d = new Date();
          d.setMonth(d.getMonth() - 6);
          startDate = d.toISOString().split('T')[0];
        } else {
          startDate = new Date(latestRecord.date).toISOString().split('T')[0];
        }

        const endDate = new Date().toISOString().split('T')[0];

        const queryOptions = {
          period1: startDate,
          period2: endDate,
          interval: '1d' as const,
        };

        const result: any = await this.yahooFinance.chart(stock.symbol, queryOptions);
        const quotes = result?.quotes || [];

        for (const item of quotes) {
          if (!item.close) continue;

          const formattedDate = new Date(item.date).toISOString().split('T')[0];
          await this.stockRepository.upsert(
            {
              symbol: stock.symbol,
              industry: stock.industry,
              date: formattedDate as any,
              open: item.open ?? 0,
              high: item.high ?? 0,
              low: item.low ?? 0,
              close: item.close,
              volume: item.volume ?? 0,
            },
            ['symbol', 'date'],
          );
        }
        this.logger.log(`Successfully synced ${stock.symbol}`);
      } catch (error: any) {
        this.logger.error(`Error syncing ${stock.symbol}: ${error?.message || error}`);
      }
    }
  }

  // ฟังก์ชันคำนวณ RSI 14 วัน (Standard RSI)
  private calculateRSISeries(prices: number[], period: number = 14): (number | null)[] {
    if (prices.length <= period) {
      return new Array(prices.length).fill(null);
    }

    const rsiArray: (number | null)[] = new Array(period).fill(null);
    let gains = 0;
    let losses = 0;

    // คำนวณ Avg Gain / Avg Loss ช่วง 14 วันแรก
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change >= 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    let firstRsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
    rsiArray.push(Number(firstRsi.toFixed(2)));

    // คำนวณแบบ Wilder's Smoothing สำหรับวันถัดๆ ไป
    for (let i = period + 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      const currentGain = change >= 0 ? change : 0;
      const currentLoss = change < 0 ? Math.abs(change) : 0;

      avgGain = (avgGain * (period - 1) + currentGain) / period;
      avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

      if (avgLoss === 0) {
        rsiArray.push(100);
      } else {
        rs = avgGain / avgLoss;
        const rsi = 100 - 100 / (1 + rs);
        rsiArray.push(Number(rsi.toFixed(2)));
      }
    }

    return rsiArray;
  }

  async calculateStocks(dto: CalculateStockDto) {
    const targetSymbols =
      dto.symbols && dto.symbols.length > 0
        ? dto.symbols
        : this.stockList.map((s) => s.symbol);

    const summary = [];

    for (const symbol of targetSymbols) {
      const records = await this.stockRepository
        .createQueryBuilder('stock')
        .where('stock.symbol = :symbol', { symbol })
        .andWhere('stock.date >= :startDate AND stock.date <= :endDate', {
          startDate: dto.startDate,
          endDate: dto.endDate,
        })
        .orderBy('stock.date', 'ASC')
        .getMany();

      if (records.length === 0) continue;

      // ดึงราคาปิดทั้งหมดมาคำนวณ RSI
      const closePrices = records.map((r) => Number(r.close));
      const rsiValues = this.calculateRSISeries(closePrices, 14);

      const startPrice = records[0].close;
      const endPrice = records[records.length - 1].close;
      const priceChange = Number((endPrice - startPrice).toFixed(2));
      const percentageChange = Number(((priceChange / startPrice) * 100).toFixed(2));

      const firstTradingDate = new Date(records[0].date).toISOString().split('T')[0];
      const endDate = new Date(records[records.length - 1].date).toISOString().split('T')[0];

      // ค่า RSI วันล่าสุด
      const latestRsi = rsiValues[rsiValues.length - 1];

      summary.push({
        symbol,
        industry: records[0].industry,
        requestedStartDate: dto.startDate,
        firstTradingDate,
        endDate,
        startPrice: Number(startPrice).toFixed(2),
        endPrice: Number(endPrice).toFixed(2),
        priceChange,
        percentageChange,
        latestRSI: latestRsi, // ค่า RSI ล่าสุด
        rsiStatus: latestRsi !== null 
          ? (latestRsi >= 70 ? 'Overbought' : latestRsi <= 30 ? 'Oversold' : 'Neutral') 
          : 'N/A', // สถานะ Overbought (>70) / Oversold (<30)
        totalRecords: records.length,
        dailyPrices: records.map((r, index) => ({
          date: new Date(r.date).toISOString().split('T')[0],
          open: Number(r.open),
          high: Number(r.high),
          low: Number(r.low),
          close: Number(r.close),
          volume: Number(r.volume),
          rsi: rsiValues[index], // RSI รายวัน
        })),
      });
    }

    return { summary };
  }
}