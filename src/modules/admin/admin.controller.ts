import { Controller, Get, Post, Put, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { AdminService } from './admin.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  /* ── Stats y analítica ── */
  @Get('stats')
  stats() { return this.svc.getStats() }

  @Get('analytics')
  analytics() { return this.svc.getAnalytics() }

  @Get('needs-intelligence')
  needsIntelligence() { return this.svc.getNeedsIntelligence() }

  /* ── Instituciones ── */
  @Get('institutions')
  institutions() { return this.svc.getAllInstitutions() }

  @Get('institutions/pending')
  pending() { return this.svc.getPendingInstitutions() }

  @Post('institutions/:id/approve')
  approve(@Param('id') id: string) { return this.svc.approveInstitution(id) }

  @Patch('institutions/:id/verify')
  verify(@Param('id') id: string) { return this.svc.toggleVerifyInstitution(id) }

  @Delete('institutions/:id')
  reject(@Param('id') id: string) { return this.svc.rejectInstitution(id) }

  /* ── Usuarios ── */
  @Get('users')
  users() { return this.svc.getUsers() }

  @Patch('users/:id/active')
  toggleActive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.toggleUserActive(id, user.id)
  }

  @Patch('users/:id/role')
  changeRole(@Param('id') id: string, @Body('role') role: string, @CurrentUser() user: any) {
    return this.svc.changeUserRole(id, role, user.id)
  }

  /* ── Reseñas ── */
  @Get('reviews')
  reviews() { return this.svc.getReviews() }

  @Delete('reviews/:id')
  deleteReview(@Param('id') id: string) { return this.svc.deleteReview(id) }

  /* ── Alertas de riesgo ── */
  @Get('alerts')
  alerts() { return this.svc.getAlerts() }

  /* ── Configuración ── */
  @Get('settings')
  settings() { return this.svc.getSettings() }

  @Put('settings')
  updateSettings(@Body() body: Record<string, string>) { return this.svc.updateSettings(body) }
}
