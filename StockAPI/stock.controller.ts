import { Controller, Post, Body } from '@nestjs/common';
import { StockService } from './stock.service';

@Controller('stocks')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Post('sync-now')
  async syncNow(@Body() body: { startDate?: string; endDate?: string }) {
    return this.stockService.syncAllStocks(body.startDate, body.endDate);
  }
}