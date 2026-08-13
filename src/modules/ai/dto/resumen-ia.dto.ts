import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class RespuestaResumenDto {
  @ApiProperty({
    description: 'Resumen narrativo interpretativo en 1 párrafo basado estrictamente en los datos del usuario',
    example: 'María es una mujer de 28 años diagnosticada con autismo desde la infancia. Actualmente vive en Mérida, Yucatán, donde busca oportunidades de empleo inclusivo. Su perfil indica un nivel moderado de independencia y comunicación, con preferencia por contenido visual. Ha expresado interés en formación profesional y conexión con la comunidad.',
  })
  resumenUnParrafo!: string

  @ApiProperty({
    description: 'Resumen consolidado en 3 párrafos: (1) Quién eres, (2) Tu contexto, (3) Tus intereses/aspiraciones',
    example: {
      quienEres: 'María es una mujer de 28 años con diagnóstico de autismo...',
      contexto: 'Vive en Mérida, Yucatán. Su nivel de independencia es...',
      intereses: 'Busca oportunidades de empleo inclusivo y formación...',
    },
  })
  resumenTresParrafos!: { quienEres: string; contexto: string; intereses: string }

  @ApiProperty({
    description: 'true si la respuesta es simulada (sin Vertex AI o fallo)',
    example: false,
  })
  simulado!: boolean
}
