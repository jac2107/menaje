-- Retira TODOS los datos de ejemplo del historial (alquileres, sus items y el cliente
-- ficticio). Los alquileres reales (es_ejemplo = FALSE) no se tocan.
--   docker exec -i menaje_postgres psql -U postgres -d menaje_db -v ON_ERROR_STOP=1 -q \
--     < database/seeds/historial_alquileres_ejemplo_quitar.sql
BEGIN;
DELETE FROM alquileres WHERE es_ejemplo;      -- los items caen por ON DELETE CASCADE
DELETE FROM usuarios WHERE correo = 'ejemplo@menaje.invalid';
COMMIT;
