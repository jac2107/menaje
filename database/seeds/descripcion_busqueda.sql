-- Rellena productos.descripcion_busqueda (migracion 004). Idempotente: se puede
-- volver a ejecutar. Cada frase se basa solo en el nombre, la categoria y la
-- descripcion real del producto. Despues hay que regenerar los embeddings:
--   python python-ml/cargar_embeddings.py
UPDATE productos p
   SET descripcion_busqueda = v.frase
  FROM (VALUES
    ('Plato Entrada Tendencia Blanco 23cm', 'plato blanco para servir entradas y postres en cenas, banquetes y catering de eventos'),
    ('Plato Fondo Redondo Cúpula 27cm', 'plato principal de porcelana para servir el plato fuerte en cenas formales, banquetes y vajilla de eventos'),
    ('Copa Flauta Premium para Champagne', 'copa elegante para brindar con champagne o espumante en bodas, aniversarios y celebraciones'),
    ('Copa de Vino Tinto Tradicional', 'copa para servir vino tinto en cenas, bodas y recepciones'),
    ('Vaso Alto Validus 12oz', 'vaso alto para servir gaseosas, cocteles y agua en fiestas y eventos'),
    ('Tenedor de Mesa Acero Inoxidable', 'tenedor de mesa para cubiertos de catering, cenas y banquetes'),
    ('Cuchillo de Carne Sierra Fina', 'cuchillo para cortar carne en cenas y banquetes, parte de los cubiertos de mesa'),
    ('Mantel Rectangular Blanco Jacquard', 'mantel blanco elegante para cubrir mesas rectangulares en bodas, banquetes y cenas formales'),
    ('Tenedor Dorado Premium', 'tenedor dorado para cubiertos de mesa en bodas y eventos de gala'),
    ('Cuchillo Dorado Premium', 'cuchillo dorado para cubiertos de mesa en bodas y eventos de gala'),
    ('Cuchara Dorada Premium', 'cuchara dorada para cubiertos de mesa en bodas y eventos de gala'),
    ('Plato de Sitio Vidrio Bordes Dorados', 'plato base de vidrio con borde dorado para decorar el puesto de cada invitado en bodas y cenas de gala'),
    ('Plato de Sitio de Madera Natural', 'plato base de madera para decorar la mesa en bodas y fiestas de estilo rústico'),
    ('Copa de Vino Verde Bohemia', 'copa de cristal verde para servir vino, de estilo bohemio para mesas decoradas'),
    ('Copa Flauta Dorada Premium', 'copa flauta dorada para brindis en bodas y celebraciones de gala'),
    ('Vaso Rústico de Madera', 'vaso de estilo rústico para servir bebidas en fiestas y eventos campestres'),
    ('Mantel Dorado Satinado', 'mantel dorado para cubrir mesas en bodas y eventos de gala'),
    ('Mantel Rústico de Yute', 'mantel de yute para cubrir mesas en bodas y fiestas de estilo rústico o campestre'),
    ('Copa Margarita Cristal', 'copa para servir cócteles y margaritas en fiestas y barras de tragos'),
    ('Vaso Old Fashioned Whisky', 'vaso bajo para servir whisky y tragos cortos en fiestas, bares y recepciones'),
    ('Vaso Shot Tequilero', 'vaso pequeño para servir shots y tequila en fiestas'),
    ('Plato Postre Cuadrado Moderno', 'plato cuadrado para servir postres, aperitivos y bocaditos en eventos'),
    ('Cuchara Sopera Clásica', 'cuchara de mesa para servir sopa y comer en cenas, banquetes y catering'),
    ('Camino de Mesa Yute Rústico', 'camino de mesa para decorar mesas en bodas y fiestas de estilo rústico o campestre'),
    ('Mantel Redondo Satinado Blanco', 'mantel blanco para cubrir mesas redondas en bodas, banquetes y cenas elegantes'),
    ('Cubeta de Hielo Acero Inoxidable', 'cubeta para hielo con la que se mantienen frías las bebidas en fiestas y eventos'),
    ('Centro de Mesa Florero Cristal', 'florero de cristal para decorar el centro de las mesas en bodas y eventos'),
    ('Servilletero de Metal', 'servilletero dorado para decorar y ordenar las servilletas de la mesa en bodas y cenas'),
    ('Plato Desechable Blanco 10"', 'plato desechable blanco para servir comida en fiestas, reuniones y eventos sin tener que lavar'),
    ('Plato Desechable Dorado 10"', 'plato desechable dorado para servir comida en fiestas y eventos sin tener que lavar'),
    ('Vaso Plástico Transparente 9oz', 'vaso de plástico para servir bebidas en fiestas, cumpleaños y reuniones'),
    ('Cubierto Desechable Plata (set)', 'cubiertos desechables plateados (tenedor, cuchillo y cuchara) para fiestas y reuniones sin lavar'),
    ('Cubierto Desechable Oro (set)', 'cubiertos desechables dorados (tenedor, cuchillo y cuchara) para fiestas y reuniones sin lavar'),
    ('Mantel Dorado 1.5x1.5m', 'mantel dorado cuadrado para cubrir mesas pequeñas en eventos elegantes'),
    ('Copa de Cristal 6oz Clásica', 'copa de cristal para servir vino y bebidas en cenas, bodas y recepciones'),
    ('Jarra de Cristal 1.5L', 'jarra para servir agua y bebidas frescas en la mesa durante cenas y eventos'),
    ('Silla de Hierro Negra', 'silla para sentar a los invitados en bodas, fiestas y eventos'),
    ('Mesa Redonda 1.2m Diámetro', 'mesa redonda para sentar de 4 a 6 invitados en bodas, banquetes y fiestas')
  ) AS v(nombre, frase)
 WHERE p.nombre = v.nombre;
