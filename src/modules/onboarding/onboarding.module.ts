import { Module } from '@nestjs/common'
import { OnboardingController } from './onboarding.controller'
import { OnboardingService } from './onboarding.service'
import { EtapaGuard } from './etapa.guard'

@Module({
  controllers: [OnboardingController],
  providers: [OnboardingService, EtapaGuard],
  // Exporta el servicio y el guard para que otros módulos puedan usar
  // @UseGuards(EtapaGuard) + @RequireEtapa(n) importando OnboardingModule.
  exports: [OnboardingService, EtapaGuard],
})
export class OnboardingModule {}
