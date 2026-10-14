import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { COLECCIONES } from '../../../database/firestore.constants';

@Injectable()
export class SeedInstitutionsService {
  private readonly logger = new Logger(SeedInstitutionsService.name);
  private db: Firestore;

  constructor() {
    const apps = getApps();
    if (apps.length === 0) {
      const projectId = process.env.FIREBASE_PROJECT_ID || 'raices-demo';
      const serviceAccountJson = process.env.FIREBASE_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT;

      if (serviceAccountJson) {
        try {
          const parsed = typeof serviceAccountJson === 'string'
            ? JSON.parse(serviceAccountJson)
            : serviceAccountJson;
          initializeApp({
            credential: cert(parsed),
            projectId: parsed.project_id || projectId,
          });
        } catch (e) {
          this.logger.warn('No se pudo parsear FIREBASE_CREDENTIALS, usando projectId solo');
          initializeApp({ projectId });
        }
      } else {
        initializeApp({ projectId });
      }
    }
    this.db = getFirestore();
  }

  /**
   * Lee un archivo CSV local y masivamente inserta instituciones y sus servicios en Firestore.
   * El CSV debe tener columnas: nombre,latitud,longitud,categoria_servicio,ciudad
   */
  async seedFromCsv(csvPath?: string): Promise<{ institucionesInsertadas: number; serviciosInsertados: number }> {
    const t0 = Date.now();

    // Ruta por defecto: archivo dentro de la propia carpeta del seed
    const defaultCsvPath = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'database',
      'seed',
      'instituciones_base.csv',
    );
    const csvFile = csvPath || defaultCsvPath;

    if (!fs.existsSync(csvFile)) {
      throw new Error(`Archivo CSV no encontrado: ${csvFile}`);
    }

    const csvContent = fs.readFileSync(csvFile, 'utf-8');
    const lineas = csvContent.trim().split('\n');

    const header = lineas[0];
    const columnas = header.split(',').map(c => c.trim());
    const nombreIdx = columnas.indexOf('nombre');
    const latIdx = columnas.indexOf('latitud');
    const lngIdx = columnas.indexOf('longitud');
    const categoriaIdx = columnas.indexOf('categoria_servicio');
    const ciudadIdx = columnas.indexOf('ciudad');

    if (nombreIdx === -1 || latIdx === -1 || lngIdx === -1 || categoriaIdx === -1 || ciudadIdx === -1) {
      throw new Error('El CSV debe tener columnas: nombre, latitud, longitud, categoria_servicio, ciudad');
    }

    const instituciones: any[] = [];
    const servicios: any[] = [];

    // Saltar header, procesar filas
    for (let i = 1; i < lineas.length; i++) {
      const campos = lineas[i].split(',').map(c => c.trim());

      if (campos.length < 5) continue; // fila incompleta

      const nombre = campos[nombreIdx];
      const latitud = parseFloat(campos[latIdx]);
      const longitud = parseFloat(campos[lngIdx]);
      const categoriaServicio = campos[categoriaIdx];
      const ciudad = campos[ciudadIdx] || 'Merida';

      // 1. Insertar institución
      const instId = `inst-${Date.now()}-${i}`;
      instituciones.push({
        id: instId,
        nombre,
        categoria: categoriaServicio,
        ciudad,
        latitud,
        longitud,
        descripcion: `${nombre} - Centro de apoyo para personas con discapacidad`,
        telefono: '',
        whatsapp: '',
        email: `${nombre.toLowerCase().replace(/\s+/g, '.')}@raices.mx`,
        tiposDiscapacidad: JSON.stringify(['motriz', 'intelectual', 'tea']),
        edadMinima: 0,
        edadMaxima: 99,
        verificada: true,
        activa: true,
        tipoPlan: 'gratuito',
        creadoPor: 'system',
        fechaCreacion: new Date().toISOString(),
      });

      // 2. Insertar servicios públicos asociados a la institución
      // Mapeo de categorías a tipos de servicios sugeridos
      const serviciosPorCategoria = this.obtenerServiciosPorCategoria(categoriaServicio);
      for (const svc of serviciosPorCategoria) {
        servicios.push({
          id: `svc-${instId}-${svc.tipo}`,
          nombre: svc.nombre,
          categoria: svc.categoria,
          costo: svc.costo ?? 'Gratuito',
          institucionId: instId,
          ciudad,
          horario: svc.horario ?? 'Lun-Vie 8:00-16:00',
          estado: 'Activo',
          creadoPor: 'system',
          fechaCreacion: new Date().toISOString(),
        });
      }
    }

    // Insertar instituciones en lote
    this.logger.log(`📝 Insertando ${instituciones.length} instituciones...`);
    await this.insertarInstitucionesLote(instituciones);

    // Insertar servicios en lote
    this.logger.log(`📝 Insertando ${servicios.length} servicios públicos...`);
    await this.insertarServiciosLote(servicios);

    const tiempoTotal = ((Date.now() - t0) / 1000).toFixed(1);
    this.logger.log(`✅ Seed completado en ${tiempoTotal}s`);

    return {
      institucionesInsertadas: instituciones.length,
      serviciosInsertados: servicios.length,
    };
  }

  private obtenerServiciosPorCategoria(categoria: string): { tipo: string; nombre: string; categoria?: string; costo?: string; horario?: string }[] {
    const mapa: Record<string, { tipo: string; nombre: string; categoria?: string; costo?: string; horario?: string }> = {
      funcional: [
        { tipo: 'terapia', nombre: 'Fisioterapia', categoria: 'funcional', costo: 'Consultar', horario: 'Lun-Vie 8:00-16:00' },
        { tipo: 'terapia', nombre: 'Terapia Ocupacional', categoria: 'funcional', costo: 'Consultar', horario: 'Lun-Vie 8:00-16:00' },
      ],
      educativo: [
        { tipo: 'escuela', nombre: 'Educación Especial', categoria: 'educativo', costo: 'Gratuito', horario: 'Lun-Vie 8:00-14:00' },
        { tipo: 'escuela', nombre: 'Inclusión Escolar', categoria: 'educativo', costo: 'Gratuito', horario: 'Lun-Vie 8:00-14:00' },
      ],
      laboral: [
        { tipo: 'vacante', nombre: 'Capacitación Laboral', categoria: 'laboral', costo: 'Gratuito', horario: 'Lun-Vie 8:00-14:00' },
        { tipo: 'vacante', nombre: 'Inserción Laboral', categoria: 'laboral', costo: 'Gratuito', horario: 'Lun-Vie 8:00-14:00' },
      ],
      social: [
        { tipo: 'centro', nombre: 'Grupo de Apoyo', categoria: 'social', costo: 'Gratuito', horario: 'Mar-Vie 9:00-15:00' },
        { tipo: 'comunidad', nombre: 'Actividades Sociales', categoria: 'social', costo: 'Gratuito', horario: 'Sáb 10:00-14:00' },
      ],
    };

    const resultado = mapa[categoria] ?? mapa.funcional;
    return resultado.length > 0 ? resultado : mapa.funcional;
  }

  private async insertarInstitucionesLote(instituciones: any[]): Promise<void> {
    const batchSize = 500;
    for (let i = 0; i < instituciones.length; i += batchSize) {
      const lote = this.db.batch();
      const porcion = instituciones.slice(i, i + batchSize);
      for (const datos of porcion) {
        const ref = this.db.collection(COLECCIONES.instituciones).doc(datos.id);
        lote.set(ref, datos);
      }
      await lote.commit();
    }
  }

  private async insertarServiciosLote(servicios: any[]): Promise<void> {
    const batchSize = 500;
    for (let i = 0; i < servicios.length; i += batchSize) {
      const lote = this.db.batch();
      const porcion = servicios.slice(i, i + batchSize);
      for (const datos of porcion) {
        const ref = this.db.collection(COLECCIONES.instituciones).doc(datos.institucionId).collection('servicios').doc(datos.id);
        lote.set(ref, datos);
      }
      await lote.commit();
    }
  }
}