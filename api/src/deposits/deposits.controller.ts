import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { DepositsService } from './deposits.service.js';
import { CreatePixDepositDto } from './dto/create-pix-deposit.dto.js';

@Controller('depositos')
export class DepositsController {
  constructor(private readonly deposits: DepositsService) {}

  @Post()
  create(@Body() dto: CreatePixDepositDto) {
    return this.deposits.create(dto);
  }

  @Get(':id')
  find(@Param('id') id: string) {
    return this.deposits.find(id);
  }
}
