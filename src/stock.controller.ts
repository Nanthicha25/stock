import { Controller, Post, Body, Get } from '@nestjs/common';
import { StockService } from './stock.service';
import { CalculateStockDto } from './calculate-stock.dto';

@Controller('stocks')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Post('calculate')
  async calculate(@Body() dto: CalculateStockDto) {
    return this.stockService.calculateStocks(dto);
  }

  @Get('sync-now')
  async manualSync() {
    await this.stockService.syncStockData();
    return { message: 'Manual sync triggered successfully' };
  }
}