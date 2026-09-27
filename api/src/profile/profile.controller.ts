import { Body, Controller, Delete, Get, HttpCode, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { User } from '../generated/prisma/client.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { DeleteAccountDto } from './dto/delete-account.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ProfileService } from './profile.service.js';

@Controller('perfil')
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  get(@CurrentUser() user: User) {
    return this.profile.get(user);
  }

  @Patch()
  update(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.profile.update(user, dto);
  }

  @Patch('senha')
  changePassword(@CurrentUser() user: User, @Body() dto: ChangePasswordDto) {
    return this.profile.changePassword(user, dto);
  }

  @Delete()
  @HttpCode(204)
  async delete(@CurrentUser() user: User, @Body() dto: DeleteAccountDto) {
    await this.profile.delete(user, dto.senha);
  }
}
