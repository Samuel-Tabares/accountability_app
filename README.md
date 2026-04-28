# TRABIX Granizados

Panel operativo para ventas, embajadores, lotes manuales FIFO y finanzas.

## Stack

- Next.js
- TypeScript
- Preparado para Supabase auth/data layer
- Persistencia local para el prototipo funcional

## Uso local

```bash
npm install
npm run dev
```

## Estado inicial

- La app arranca vacía para que puedas seedear todos los flujos desde cero.
- El acceso local abre un panel admin vacío.
- Los lotes se cargan con líneas manuales de costo: granizados obligatorios y otros gastos opcionales.
- Los gastos operativos se registran aparte del lote para calcular utilidad bruta y neta.

## Producción

1. Configura Supabase en .env.local.
2. Conecta la capa de `src/lib/supabase.ts` a la autenticación y persistencia real.
3. Despliega en Vercel.
