import { Controller, Post, Body } from '@nestjs/common';
import { StockService } from './stock.service';
import { ProcessRecoveryStockDto } from './dto/process-recovery-stock.dto'; // ปรับ path ตามจริง

@Controller('stocks')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Post('sync-now')
  async syncNow(@Body() body: any) {
    const requestedMonths = body.months || body.period || body.periodMonths;

    
    return this.stockService.processRecoveryStocks(Number(requestedMonths));
  }

  @Post('recovery')
  async processRecovery(@Body() body: any) {
    const requestedMonths = body.period || body.periodMonths || body.months;
    return this.stockService.processRecoveryStocks(Number(requestedMonths));
  }
}