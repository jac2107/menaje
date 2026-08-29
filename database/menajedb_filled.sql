--
-- PostgreSQL database dump
--

\restrict 0hCXNl2PO2DYoFfmmyzVWuyh1VfEDm6dAxpfesAebE9YPfKtfKyGjUTzixYCdzW

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

-- Started on 2026-08-29 14:59:32

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 6 (class 2615 OID 2200)
-- Name: public; Type: SCHEMA; Schema: -; Owner: postgres
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO postgres;

--
-- TOC entry 5206 (class 0 OID 0)
-- Dependencies: 6
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA public IS '';


--
-- TOC entry 2 (class 3079 OID 24577)
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- TOC entry 5208 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 220 (class 1259 OID 24615)
-- Name: alquiler_eventos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.alquiler_eventos (
    id integer NOT NULL,
    alquiler_id integer NOT NULL,
    estado_antes character varying(30),
    estado_nuevo character varying(30) NOT NULL,
    usuario_id integer NOT NULL,
    metodo character varying(20) DEFAULT 'manual'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT alquiler_eventos_metodo_check CHECK (((metodo)::text = ANY (ARRAY[('qr'::character varying)::text, ('manual'::character varying)::text])))
);


ALTER TABLE public.alquiler_eventos OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 24625)
-- Name: alquiler_eventos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.alquiler_eventos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.alquiler_eventos_id_seq OWNER TO postgres;

--
-- TOC entry 5209 (class 0 OID 0)
-- Dependencies: 221
-- Name: alquiler_eventos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.alquiler_eventos_id_seq OWNED BY public.alquiler_eventos.id;


--
-- TOC entry 222 (class 1259 OID 24626)
-- Name: alquiler_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.alquiler_items (
    id integer NOT NULL,
    alquiler_id integer NOT NULL,
    producto_id integer NOT NULL,
    cantidad integer NOT NULL,
    precio_unit numeric(10,2) NOT NULL,
    subtotal numeric(10,2) GENERATED ALWAYS AS (((cantidad)::numeric * precio_unit)) STORED,
    CONSTRAINT alquiler_items_cantidad_check CHECK ((cantidad > 0))
);


ALTER TABLE public.alquiler_items OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 24636)
-- Name: alquiler_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.alquiler_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.alquiler_items_id_seq OWNER TO postgres;

--
-- TOC entry 5210 (class 0 OID 0)
-- Dependencies: 223
-- Name: alquiler_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.alquiler_items_id_seq OWNED BY public.alquiler_items.id;


--
-- TOC entry 224 (class 1259 OID 24637)
-- Name: alquileres; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.alquileres (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    fecha_entrega date NOT NULL,
    hora_entrega time without time zone,
    fecha_recojo date NOT NULL,
    hora_recojo time without time zone,
    direccion_evento text NOT NULL,
    subtotal numeric(10,2) DEFAULT 0 NOT NULL,
    descuento_pct numeric(5,2) DEFAULT 0 NOT NULL,
    descuento_monto numeric(10,2) DEFAULT 0 NOT NULL,
    garantia numeric(10,2) DEFAULT 0 NOT NULL,
    total numeric(10,2) DEFAULT 0 NOT NULL,
    estado character varying(30) DEFAULT 'confirmado'::character varying NOT NULL,
    qr_token uuid DEFAULT gen_random_uuid(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    lat numeric(10,7),
    lng numeric(10,7),
    CONSTRAINT alquileres_estado_check CHECK (((estado)::text = ANY (ARRAY[('confirmado'::character varying)::text, ('entregado'::character varying)::text, ('recogido'::character varying)::text, ('en_revision'::character varying)::text, ('cerrado'::character varying)::text])))
);


ALTER TABLE public.alquileres OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 24663)
-- Name: alquileres_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.alquileres_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.alquileres_id_seq OWNER TO postgres;

--
-- TOC entry 5211 (class 0 OID 0)
-- Dependencies: 225
-- Name: alquileres_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.alquileres_id_seq OWNED BY public.alquileres.id;


--
-- TOC entry 226 (class 1259 OID 24664)
-- Name: categorias; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categorias (
    id integer NOT NULL,
    nombre character varying(50) NOT NULL
);


ALTER TABLE public.categorias OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 24669)
-- Name: categorias_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.categorias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.categorias_id_seq OWNER TO postgres;

--
-- TOC entry 5212 (class 0 OID 0)
-- Dependencies: 227
-- Name: categorias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.categorias_id_seq OWNED BY public.categorias.id;


--
-- TOC entry 228 (class 1259 OID 24670)
-- Name: cierre_garantia; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cierre_garantia (
    id integer NOT NULL,
    alquiler_id integer NOT NULL,
    garantia_cobrada numeric(10,2) NOT NULL,
    monto_descontado numeric(10,2) DEFAULT 0 NOT NULL,
    monto_devuelto numeric(10,2) DEFAULT 0 NOT NULL,
    monto_adicional numeric(10,2) DEFAULT 0 NOT NULL,
    observaciones text,
    cerrado_por integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.cierre_garantia OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 24686)
-- Name: cierre_garantia_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.cierre_garantia_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cierre_garantia_id_seq OWNER TO postgres;

--
-- TOC entry 5213 (class 0 OID 0)
-- Dependencies: 229
-- Name: cierre_garantia_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.cierre_garantia_id_seq OWNED BY public.cierre_garantia.id;


--
-- TOC entry 230 (class 1259 OID 24687)
-- Name: configuracion; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.configuracion (
    clave character varying(80) NOT NULL,
    valor text NOT NULL
);


ALTER TABLE public.configuracion OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 24694)
-- Name: descuentos_cliente; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.descuentos_cliente (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    porcentaje numeric(5,2) NOT NULL,
    asignado_por integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT descuentos_cliente_porcentaje_check CHECK (((porcentaje >= (0)::numeric) AND (porcentaje <= (100)::numeric)))
);


ALTER TABLE public.descuentos_cliente OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 24704)
-- Name: descuentos_cliente_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.descuentos_cliente_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.descuentos_cliente_id_seq OWNER TO postgres;

--
-- TOC entry 5214 (class 0 OID 0)
-- Dependencies: 232
-- Name: descuentos_cliente_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.descuentos_cliente_id_seq OWNED BY public.descuentos_cliente.id;


--
-- TOC entry 233 (class 1259 OID 24705)
-- Name: pagos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pagos (
    id integer NOT NULL,
    alquiler_id integer NOT NULL,
    monto numeric(10,2) NOT NULL,
    metodo character varying(50) NOT NULL,
    registrado_por integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.pagos OWNER TO postgres;

--
-- TOC entry 234 (class 1259 OID 24714)
-- Name: pagos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pagos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pagos_id_seq OWNER TO postgres;

--
-- TOC entry 5215 (class 0 OID 0)
-- Dependencies: 234
-- Name: pagos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pagos_id_seq OWNED BY public.pagos.id;


--
-- TOC entry 235 (class 1259 OID 24715)
-- Name: paquete_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.paquete_items (
    id integer NOT NULL,
    paquete_id integer NOT NULL,
    producto_id integer NOT NULL,
    cantidad integer NOT NULL,
    CONSTRAINT paquete_items_cantidad_check CHECK ((cantidad > 0))
);


ALTER TABLE public.paquete_items OWNER TO postgres;

--
-- TOC entry 236 (class 1259 OID 24723)
-- Name: paquete_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.paquete_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.paquete_items_id_seq OWNER TO postgres;

--
-- TOC entry 5216 (class 0 OID 0)
-- Dependencies: 236
-- Name: paquete_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.paquete_items_id_seq OWNED BY public.paquete_items.id;


--
-- TOC entry 237 (class 1259 OID 24724)
-- Name: paquetes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.paquetes (
    id integer NOT NULL,
    nombre character varying(150) NOT NULL,
    descripcion text,
    foto_url text,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.paquetes OWNER TO postgres;

--
-- TOC entry 238 (class 1259 OID 24733)
-- Name: paquetes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.paquetes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.paquetes_id_seq OWNER TO postgres;

--
-- TOC entry 5217 (class 0 OID 0)
-- Dependencies: 238
-- Name: paquetes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.paquetes_id_seq OWNED BY public.paquetes.id;


--
-- TOC entry 239 (class 1259 OID 24734)
-- Name: productos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.productos (
    id integer NOT NULL,
    nombre character varying(150) NOT NULL,
    categoria_id integer NOT NULL,
    descripcion text,
    precio_unidad numeric(10,2) NOT NULL,
    stock_total integer DEFAULT 0 NOT NULL,
    stock_baja integer DEFAULT 0 NOT NULL,
    foto_url text,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.productos OWNER TO postgres;

--
-- TOC entry 240 (class 1259 OID 24749)
-- Name: productos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.productos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.productos_id_seq OWNER TO postgres;

--
-- TOC entry 5218 (class 0 OID 0)
-- Dependencies: 240
-- Name: productos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.productos_id_seq OWNED BY public.productos.id;


--
-- TOC entry 241 (class 1259 OID 24750)
-- Name: revision_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.revision_items (
    id integer NOT NULL,
    alquiler_id integer NOT NULL,
    alquiler_item_id integer NOT NULL,
    cantidad_ok integer DEFAULT 0 NOT NULL,
    cantidad_rota integer DEFAULT 0 NOT NULL,
    cantidad_faltante integer DEFAULT 0 NOT NULL,
    descripcion_dano text,
    todo_conforme boolean DEFAULT false
);


ALTER TABLE public.revision_items OWNER TO postgres;

--
-- TOC entry 242 (class 1259 OID 24765)
-- Name: revision_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.revision_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.revision_items_id_seq OWNER TO postgres;

--
-- TOC entry 5219 (class 0 OID 0)
-- Dependencies: 242
-- Name: revision_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.revision_items_id_seq OWNED BY public.revision_items.id;


--
-- TOC entry 243 (class 1259 OID 24766)
-- Name: stock_movimientos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stock_movimientos (
    id integer NOT NULL,
    producto_id integer NOT NULL,
    tipo character varying(30) NOT NULL,
    cantidad integer NOT NULL,
    motivo text,
    usuario_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT stock_movimientos_tipo_check CHECK (((tipo)::text = ANY (ARRAY[('entrada'::character varying)::text, ('baja'::character varying)::text, ('correccion'::character varying)::text])))
);


ALTER TABLE public.stock_movimientos OWNER TO postgres;

--
-- TOC entry 244 (class 1259 OID 24778)
-- Name: stock_movimientos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.stock_movimientos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.stock_movimientos_id_seq OWNER TO postgres;

--
-- TOC entry 5220 (class 0 OID 0)
-- Dependencies: 244
-- Name: stock_movimientos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.stock_movimientos_id_seq OWNED BY public.stock_movimientos.id;


--
-- TOC entry 245 (class 1259 OID 24779)
-- Name: usuarios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    nombre character varying(150) NOT NULL,
    dni character varying(8) NOT NULL,
    telefono character varying(15),
    correo character varying(150) NOT NULL,
    password text NOT NULL,
    rol character varying(20) NOT NULL,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT usuarios_rol_check CHECK (((rol)::text = ANY (ARRAY[('cliente'::character varying)::text, ('trabajador'::character varying)::text, ('dueno'::character varying)::text])))
);


ALTER TABLE public.usuarios OWNER TO postgres;

--
-- TOC entry 246 (class 1259 OID 24793)
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.usuarios_id_seq OWNER TO postgres;

--
-- TOC entry 5221 (class 0 OID 0)
-- Dependencies: 246
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- TOC entry 4911 (class 2604 OID 24794)
-- Name: alquiler_eventos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alquiler_eventos ALTER COLUMN id SET DEFAULT nextval('public.alquiler_eventos_id_seq'::regclass);


--
-- TOC entry 4914 (class 2604 OID 24795)
-- Name: alquiler_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alquiler_items ALTER COLUMN id SET DEFAULT nextval('public.alquiler_items_id_seq'::regclass);


--
-- TOC entry 4916 (class 2604 OID 24796)
-- Name: alquileres id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alquileres ALTER COLUMN id SET DEFAULT nextval('public.alquileres_id_seq'::regclass);


--
-- TOC entry 4926 (class 2604 OID 24797)
-- Name: categorias id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categorias ALTER COLUMN id SET DEFAULT nextval('public.categorias_id_seq'::regclass);


--
-- TOC entry 4927 (class 2604 OID 24798)
-- Name: cierre_garantia id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cierre_garantia ALTER COLUMN id SET DEFAULT nextval('public.cierre_garantia_id_seq'::regclass);


--
-- TOC entry 4932 (class 2604 OID 24799)
-- Name: descuentos_cliente id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.descuentos_cliente ALTER COLUMN id SET DEFAULT nextval('public.descuentos_cliente_id_seq'::regclass);


--
-- TOC entry 4935 (class 2604 OID 24800)
-- Name: pagos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagos ALTER COLUMN id SET DEFAULT nextval('public.pagos_id_seq'::regclass);


--
-- TOC entry 4937 (class 2604 OID 24801)
-- Name: paquete_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paquete_items ALTER COLUMN id SET DEFAULT nextval('public.paquete_items_id_seq'::regclass);


--
-- TOC entry 4938 (class 2604 OID 24802)
-- Name: paquetes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paquetes ALTER COLUMN id SET DEFAULT nextval('public.paquetes_id_seq'::regclass);


--
-- TOC entry 4941 (class 2604 OID 24803)
-- Name: productos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.productos ALTER COLUMN id SET DEFAULT nextval('public.productos_id_seq'::regclass);


--
-- TOC entry 4946 (class 2604 OID 24804)
-- Name: revision_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.revision_items ALTER COLUMN id SET DEFAULT nextval('public.revision_items_id_seq'::regclass);


--
-- TOC entry 4951 (class 2604 OID 24805)
-- Name: stock_movimientos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_movimientos ALTER COLUMN id SET DEFAULT nextval('public.stock_movimientos_id_seq'::regclass);


--
-- TOC entry 4953 (class 2604 OID 24806)
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- TOC entry 5174 (class 0 OID 24615)
-- Dependencies: 220
-- Data for Name: alquiler_eventos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.alquiler_eventos (id, alquiler_id, estado_antes, estado_nuevo, usuario_id, metodo, created_at) FROM stdin;
1	7	confirmado	entregado	12	qr	2026-08-24 14:48:29.940947-05
\.


--
-- TOC entry 5176 (class 0 OID 24626)
-- Dependencies: 222
-- Data for Name: alquiler_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.alquiler_items (id, alquiler_id, producto_id, cantidad, precio_unit) FROM stdin;
1	1	4	50	1.60
2	1	2	50	2.00
3	2	5	30	1.00
4	2	6	30	0.80
5	3	3	20	1.80
6	3	8	1	15.00
7	4	1	40	1.50
8	4	7	40	0.90
9	5	5	60	1.00
10	5	8	2	15.00
11	6	29	50	0.50
12	6	31	50	0.15
13	6	32	50	0.35
14	7	30	30	0.80
15	7	35	30	2.00
16	7	34	2	12.00
\.


--
-- TOC entry 5178 (class 0 OID 24637)
-- Dependencies: 224
-- Data for Name: alquileres; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.alquileres (id, cliente_id, fecha_entrega, hora_entrega, fecha_recojo, hora_recojo, direccion_evento, subtotal, descuento_pct, descuento_monto, garantia, total, estado, qr_token, created_at, updated_at, lat, lng) FROM stdin;
1	2	2026-09-02	\N	2026-09-03	\N	Jr. Las Magnolias 245, Huánuco	180.00	0.00	0.00	500.00	680.00	confirmado	83eb1b1e-5a14-4c6d-988b-9e199ae9cc9f	2026-08-28 18:54:11.287215-05	2026-08-28 18:54:11.287215-05	-9.9280000	-76.2400000
2	3	2026-08-27	\N	2026-08-29	\N	Av. Circunvalación 880, Huánuco	54.00	0.00	0.00	500.00	554.00	entregado	c07cb6c4-86fd-437d-8cb3-200896e33f5f	2026-08-26 18:54:11.287215-05	2026-08-28 18:54:11.287215-05	-9.9355000	-76.2455000
3	2	2026-08-23	\N	2026-08-25	\N	Psje. Los Pinos 112, Pillco Marca, Huánuco	51.00	0.00	0.00	500.00	551.00	recogido	d9aa6089-f28f-4cc2-8c8f-47fcffe7de47	2026-08-22 18:54:11.287215-05	2026-08-28 18:54:11.287215-05	-9.9610000	-76.2480000
4	3	2026-08-18	\N	2026-08-20	\N	Jr. San Martín 530, Huánuco	96.00	0.00	0.00	500.00	596.00	en_revision	9072110b-37c8-412e-ba88-e6f1a963ed7d	2026-08-17 18:54:11.287215-05	2026-08-28 18:54:11.287215-05	-9.9300000	-76.2390000
5	2	2026-08-08	\N	2026-08-10	\N	Av. Alameda Perú 410, Huánuco	90.00	0.00	0.00	500.00	590.00	cerrado	54dc8289-f35f-4b76-a377-8395c943040c	2026-08-03 18:54:11.287215-05	2026-08-28 18:54:11.287215-05	-9.9265000	-76.2410000
6	10	2026-09-04	\N	2026-09-05	\N	Calle Principal 123, Lima	50.00	0.00	0.00	500.00	550.00	confirmado	51e0b948-06bd-4fcc-961e-4f12f8adf352	2026-08-29 14:48:29.940947-05	2026-08-29 14:48:29.940947-05	-12.0462000	-77.0369000
7	11	2026-08-28	\N	2026-08-30	\N	Av. Central 456, Miraflores	75.00	0.00	0.00	500.00	575.00	entregado	661b3fb6-0c98-4676-abeb-893f063c5012	2026-08-24 14:48:29.940947-05	2026-08-29 14:48:29.940947-05	-12.1181000	-77.0286000
\.


--
-- TOC entry 5180 (class 0 OID 24664)
-- Dependencies: 226
-- Data for Name: categorias; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.categorias (id, nombre) FROM stdin;
1	Copa
2	Vaso
3	Plato
4	Cubierto
5	Mantel
6	Otro
\.


--
-- TOC entry 5182 (class 0 OID 24670)
-- Dependencies: 228
-- Data for Name: cierre_garantia; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cierre_garantia (id, alquiler_id, garantia_cobrada, monto_descontado, monto_devuelto, monto_adicional, observaciones, cerrado_por, created_at) FROM stdin;
1	5	500.00	50.00	450.00	0.00	2 copas rotas durante el evento, descontado de la garantía.	1	2026-08-28 18:54:11.287215-05
\.


--
-- TOC entry 5184 (class 0 OID 24687)
-- Dependencies: 230
-- Data for Name: configuracion; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.configuracion (clave, valor) FROM stdin;
garantia_monto	500.00
\.


--
-- TOC entry 5185 (class 0 OID 24694)
-- Dependencies: 231
-- Data for Name: descuentos_cliente; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.descuentos_cliente (id, usuario_id, porcentaje, asignado_por, created_at, updated_at) FROM stdin;
1	10	5.00	1	2026-08-29 14:48:29.940947-05	2026-08-29 14:48:29.940947-05
\.


--
-- TOC entry 5187 (class 0 OID 24705)
-- Dependencies: 233
-- Data for Name: pagos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pagos (id, alquiler_id, monto, metodo, registrado_por, created_at) FROM stdin;
1	6	550.00	tarjeta	1	2026-08-29 14:48:29.940947-05
2	7	575.00	transferencia	1	2026-08-24 14:48:29.940947-05
\.


--
-- TOC entry 5189 (class 0 OID 24715)
-- Dependencies: 235
-- Data for Name: paquete_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.paquete_items (id, paquete_id, producto_id, cantidad) FROM stdin;
1	1	2	10
2	1	4	10
3	1	3	10
4	1	6	10
5	1	7	10
6	1	8	1
7	2	1	10
8	2	2	10
9	2	3	10
10	2	6	10
11	2	7	10
12	2	8	1
13	3	1	10
14	3	5	10
15	3	6	10
16	3	8	1
17	4	2	10
18	4	5	10
19	4	6	10
20	4	7	10
21	5	12	10
22	5	9	10
23	5	10	10
24	5	11	10
25	5	15	10
26	5	4	10
27	5	5	10
28	5	17	1
29	6	13	10
30	6	9	10
31	6	10	10
32	6	14	10
33	6	16	10
34	6	18	1
35	7	12	10
36	7	1	10
37	7	9	10
38	7	10	10
39	7	15	10
40	7	17	1
41	8	12	10
42	8	11	10
43	8	9	10
44	8	10	10
45	8	14	10
46	8	5	10
47	9	13	10
48	9	16	10
49	9	6	10
50	9	7	10
51	9	18	1
52	10	12	10
53	10	9	10
54	10	10	10
55	10	11	10
56	10	15	10
57	10	14	10
58	10	17	1
\.


--
-- TOC entry 5191 (class 0 OID 24724)
-- Dependencies: 237
-- Data for Name: paquetes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.paquetes (id, nombre, descripcion, foto_url, activo, created_at) FROM stdin;
1	Paquete Boda	Vajilla elegante para 10 personas: plato de fondo, copa de vino, copa de champagne, cubiertos y mantel.	https://media.falabella.com/falabellaPE/881333163_2/w=1500,h=1500,fit=cover	t	2026-08-28 18:53:53.979219-05
2	Paquete Quinceañera	Set festivo para 10 personas: plato de entrada, plato de fondo, copa de champagne, cubiertos y mantel.	https://http2.mlstatic.com/D_Q_NP_877139-MLU74075250158_012024-O.webp	t	2026-08-28 18:53:53.979219-05
3	Paquete Cumpleaños	Set casual para 10 personas: plato de entrada, vaso alto, cubiertos y mantel.	https://www.arander.com/cdn/shop/products/6621-vaso-high-ball-sin-centricoat-350-ml-118-oz_800x.jpg?v=1589569849	t	2026-08-28 18:53:53.979219-05
4	Paquete Almuerzo	Set práctico para 10 personas: plato de fondo, vaso alto y cubiertos.	https://veana.com/wp-content/uploads/2026/04/152K124-D-2.webp	t	2026-08-28 18:53:53.979219-05
5	Paquete Boda Premium Dorado	Línea dorada para 10 personas: plato de sitio de vidrio con bordes dorados, cubiertos dorados, copa flauta dorada, copa de vino y vaso.	\N	t	2026-08-28 18:53:53.979219-05
6	Paquete Boda Premium Madera	Línea madera para 10 personas: plato de sitio de madera, cubiertos dorados, copa de vino verde y vaso rústico de madera.	\N	t	2026-08-28 18:53:53.979219-05
7	Paquete Quinceañera Glam Dorado	Línea dorada festiva para 10 personas: plato de sitio dorado, plato de entrada, cubiertos dorados y copa flauta dorada.	\N	t	2026-08-28 18:53:53.979219-05
8	Paquete Aniversario Elegante	Set íntimo y elegante para 10 personas: plato de sitio dorado, cubiertos dorados completos, copa de vino verde y vaso.	\N	t	2026-08-28 18:53:53.979219-05
9	Paquete Rústico Campestre	Set campestre para 10 personas: plato y vaso de madera, cubiertos clásicos y mantel de yute.	\N	t	2026-08-28 18:53:53.979219-05
10	Paquete Gala Dorada	La línea dorada completa para 10 personas: plato de sitio, cubiertos completos, copa flauta y copa de vino, todo dorado/verde, con mantel dorado.	\N	t	2026-08-28 18:53:53.979219-05
\.


--
-- TOC entry 5193 (class 0 OID 24734)
-- Dependencies: 239
-- Data for Name: productos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.productos (id, nombre, categoria_id, descripcion, precio_unidad, stock_total, stock_baja, foto_url, activo, created_at) FROM stdin;
1	Plato Entrada Tendencia Blanco 23cm	3	Plato de loza blanca brillante para entradas o postres. Resiste lavados industriales.	1.50	200	0	https://veana.com/wp-content/uploads/2026/04/152K124-D-2.webp	t	2026-08-28 18:53:53.979219-05
2	Plato Fondo Redondo Cúpula 27cm	3	Plato llano principal de porcelana reforzada de alta durabilidad.	2.00	250	0	https://media.falabella.com/falabellaPE/881333163_2/w=1500,h=1500,fit=cover	t	2026-08-28 18:53:53.979219-05
3	Copa Flauta Premium para Champagne	1	Copa de cristal fino transparente, capacidad de 180ml, ideal para brindis elegantes.	1.80	180	0	https://http2.mlstatic.com/D_Q_NP_877139-MLU74075250158_012024-O.webp	t	2026-08-28 18:53:53.979219-05
4	Copa de Vino Tinto Tradicional	1	Copa de vidrio grueso de 350ml, excelente balance y peso.	1.60	300	0	https://www.plattotec.com/wp-content/uploads/2020/11/alquiler-copavinotinto-vidrio2-plattotec.jpg	t	2026-08-28 18:53:53.979219-05
5	Vaso Alto Validus 12oz	2	Vaso largo para gaseosas, cocteles o agua. Vidrio templado anticaídas leves.	1.00	400	0	https://www.arander.com/cdn/shop/products/6621-vaso-high-ball-sin-centricoat-350-ml-118-oz_800x.jpg?v=1589569849	t	2026-08-28 18:53:53.979219-05
6	Tenedor de Mesa Acero Inoxidable	4	Cubierto de acero quirúrgico pulido espejo. Modelo clásico de catering.	0.80	500	0	https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSEWBBxu75JrjTKZeDDGmXmBlJu5f8TzPl9Bg&s	t	2026-08-28 18:53:53.979219-05
7	Cuchillo de Carne Sierra Fina	4	Cuchillo con filo duradero para cortes precisos de carnes rojas.	0.90	500	0	https://www.cimaco.com.mx/ccstore/v1/images/?source=/file/v1123931467100434678/products/5324554.1.jpg&height=475&width=475	t	2026-08-28 18:53:53.979219-05
8	Mantel Rectangular Blanco Jacquard	5	Mantel de tela elegante de 3 metros por 1.5 metros, antimanchas y fácil planchado.	15.00	50	0	https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcRiM8GH-sLPohUUaChKnA0XzyatIPc58gbFvbOCXvIbN4FJjI59QzK1sVTI4xT8bYe0lIAKAkdQ2FNP0IZLOeR8jzPLD8TmAy11hqVN8hph9qaPZMJ6nMLvUS2C9m8q1sJlD3T6rg	t	2026-08-28 18:53:53.979219-05
9	Tenedor Dorado Premium	4	Tenedor de acero inoxidable bañado en oro, acabado espejo para eventos de gala.	1.40	200	0	\N	t	2026-08-28 18:53:53.979219-05
10	Cuchillo Dorado Premium	4	Cuchillo de mesa bañado en oro, juego con el tenedor dorado premium.	1.50	200	0	\N	t	2026-08-28 18:53:53.979219-05
11	Cuchara Dorada Premium	4	Cuchara de mesa bañada en oro, acabado espejo para eventos de gala.	1.40	200	0	\N	t	2026-08-28 18:53:53.979219-05
12	Plato de Sitio Vidrio Bordes Dorados	3	Plato base de vidrio templado transparente con borde pintado a mano en dorado, 33cm.	5.50	120	0	\N	t	2026-08-28 18:53:53.979219-05
13	Plato de Sitio de Madera Natural	3	Plato base circular de madera natural barnizada, ideal para decoración rústica.	4.80	120	0	\N	t	2026-08-28 18:53:53.979219-05
14	Copa de Vino Verde Bohemia	1	Copa de cristal coloreado en verde esmeralda, 350ml, estilo bohemio.	2.40	150	0	\N	t	2026-08-28 18:53:53.979219-05
15	Copa Flauta Dorada Premium	1	Copa flauta de cristal con base y borde dorado, 180ml, para brindis de gala.	2.60	150	0	\N	t	2026-08-28 18:53:53.979219-05
16	Vaso Rústico de Madera	2	Vaso con acabado exterior símil madera, interior de vidrio templado, 350ml.	2.00	150	0	\N	t	2026-08-28 18:53:53.979219-05
17	Mantel Dorado Satinado	5	Mantel satinado color dorado de 3x1.5m, brillo sutil para eventos de gala.	20.00	40	0	\N	t	2026-08-28 18:53:53.979219-05
18	Mantel Rústico de Yute	5	Mantel de yute natural de 3x1.5m, textura rústica para decoración campestre.	14.00	40	0	\N	t	2026-08-28 18:53:53.979219-05
19	Copa Margarita Cristal	1	Copa ancha de cristal para cócteles tipo margarita, 300ml.	1.40	150	0	https://placehold.co/400x300?text=Copa+Margarita	t	2026-08-28 18:54:11.287215-05
20	Vaso Old Fashioned Whisky	2	Vaso bajo y robusto de vidrio grueso, ideal para tragos cortos.	1.10	220	0	https://placehold.co/400x300?text=Vaso+Whisky	t	2026-08-28 18:54:11.287215-05
21	Vaso Shot Tequilero	2	Vaso pequeño de 60ml para shots, vidrio resistente.	0.70	300	0	https://placehold.co/400x300?text=Vaso+Shot	t	2026-08-28 18:54:11.287215-05
22	Plato Postre Cuadrado Moderno	3	Plato cuadrado de loza blanca para postres o aperitivos, 18cm.	1.30	180	0	https://placehold.co/400x300?text=Plato+Postre	t	2026-08-28 18:54:11.287215-05
23	Cuchara Sopera Clásica	4	Cuchara de acero inoxidable pulido, modelo catering estándar.	0.80	450	0	https://placehold.co/400x300?text=Cuchara+Sopera	t	2026-08-28 18:54:11.287215-05
24	Camino de Mesa Yute Rústico	5	Camino de mesa de 3m, estilo rústico/boho para eventos campestres.	8.00	40	0	https://placehold.co/400x300?text=Camino+Mesa	t	2026-08-28 18:54:11.287215-05
25	Mantel Redondo Satinado Blanco	5	Mantel circular satinado de 2.7m de diámetro, acabado elegante.	18.00	30	0	https://placehold.co/400x300?text=Mantel+Redondo	t	2026-08-28 18:54:11.287215-05
26	Cubeta de Hielo Acero Inoxidable	6	Cubeta para hielo con asas, capacidad 4L, acero pulido.	12.00	25	0	https://placehold.co/400x300?text=Cubeta+Hielo	t	2026-08-28 18:54:11.287215-05
27	Centro de Mesa Florero Cristal	6	Florero cilíndrico de cristal para centros de mesa decorativos.	10.00	35	0	https://placehold.co/400x300?text=Florero	t	2026-08-28 18:54:11.287215-05
28	Servilletero de Metal	6	Servilletero de aro metálico dorado, acabado fino para mesa decorada.	3.50	200	0	https://placehold.co/400x300?text=Servilletero	t	2026-08-28 18:54:11.287215-05
29	Plato Desechable Blanco 10"	3	Plato desechable de 10 pulgadas, color blanco, para servir platos principales	0.50	500	0	https://placehold.co/400x300?text=Plato+Blanco	t	2026-08-29 14:48:29.940947-05
30	Plato Desechable Dorado 10"	3	Plato desechable de 10 pulgadas con borde dorado, elegante y premium	0.80	300	0	https://placehold.co/400x300?text=Plato+Dorado	t	2026-08-29 14:48:29.940947-05
31	Vaso Plástico Transparente 9oz	2	Vasos de plástico transparente de 9 onzas, reutilizables y económicos	0.15	1000	0	https://placehold.co/400x300?text=Vaso+Transparente	t	2026-08-29 14:48:29.940947-05
32	Cubierto Desechable Plata (set)	4	Set de cubierto desechable en color plata (tenedor, cuchillo, cuchara)	0.35	800	0	https://placehold.co/400x300?text=Cubierto+Plata	t	2026-08-29 14:48:29.940947-05
33	Cubierto Desechable Oro (set)	4	Set de cubierto desechable en color oro (tenedor, cuchillo, cuchara)	0.45	500	0	https://placehold.co/400x300?text=Cubierto+Oro	t	2026-08-29 14:48:29.940947-05
34	Mantel Dorado 1.5x1.5m	5	Mantel de tela dorado, 1.5m x 1.5m, para eventos elegantes	12.00	30	0	https://placehold.co/400x300?text=Mantel+Dorado	t	2026-08-29 14:48:29.940947-05
35	Copa de Cristal 6oz Clásica	1	Copa de cristal elegante de 6 onzas, para vinos y bebidas	2.00	150	0	https://placehold.co/400x300?text=Copa+Clasica	t	2026-08-29 14:48:29.940947-05
36	Jarra de Cristal 1.5L	6	Jarra de cristal de 1.5 litros para agua y bebidas frescas	5.50	60	0	https://placehold.co/400x300?text=Jarra+Cristal	t	2026-08-29 14:48:29.940947-05
37	Silla de Hierro Negra	6	Silla de hierro con asiento y respaldo, color negro, resistente	25.00	100	0	https://placehold.co/400x300?text=Silla+Hierro	t	2026-08-29 14:48:29.940947-05
38	Mesa Redonda 1.2m Diámetro	6	Mesa redonda de 1.2m de diámetro, ideal para 4-6 personas	45.00	15	0	https://placehold.co/400x300?text=Mesa+Redonda	t	2026-08-29 14:48:29.940947-05
\.


--
-- TOC entry 5195 (class 0 OID 24750)
-- Dependencies: 241
-- Data for Name: revision_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.revision_items (id, alquiler_id, alquiler_item_id, cantidad_ok, cantidad_rota, cantidad_faltante, descripcion_dano, todo_conforme) FROM stdin;
1	7	14	29	1	0	Una unidad dañada durante el evento	f
\.


--
-- TOC entry 5197 (class 0 OID 24766)
-- Dependencies: 243
-- Data for Name: stock_movimientos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.stock_movimientos (id, producto_id, tipo, cantidad, motivo, usuario_id, created_at) FROM stdin;
1	29	baja	50	Alquiler activo	12	2026-08-29 14:48:29.940947-05
2	30	baja	30	Alquiler activo	12	2026-08-29 14:48:29.940947-05
\.


--
-- TOC entry 5199 (class 0 OID 24779)
-- Dependencies: 245
-- Data for Name: usuarios; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.usuarios (id, nombre, dni, telefono, correo, password, rol, activo, created_at) FROM stdin;
1	Administrador	00000000	999000000	admin@menaje.com	$2b$10$FjsoVNIyI1hxT1Zrk3ZCQ.4VyoJP/i8lDokJkm8brSCE6My3vX5wm	dueno	t	2026-08-28 18:53:53.979219-05
2	Cliente Demo	11111111	911111111	cliente.demo@menaje.com	$2b$10$DIyDc8oTjqBMSGDwhlFXb.S2JVFtImUsQF/GOeFPEIR.j04sEC7V6	cliente	t	2026-08-28 18:54:11.287215-05
3	Maria Torres	22222222	922222222	maria.torres@menaje.com	$2b$10$DIyDc8oTjqBMSGDwhlFXb.S2JVFtImUsQF/GOeFPEIR.j04sEC7V6	cliente	t	2026-08-28 18:54:11.287215-05
4	Trabajador Demo	33333333	933333333	trabajador.demo@menaje.com	$2b$10$DIyDc8oTjqBMSGDwhlFXb.S2JVFtImUsQF/GOeFPEIR.j04sEC7V6	trabajador	t	2026-08-28 18:54:11.287215-05
8	Administrador1	12345678	\N	admin123@gmail.com	$2b$10$vI8A7C.Q/S6hH.PbyDqWfeEOnrX.F6zBsh/P6D6F4w.rJ2VbW/m6.	dueno	t	2026-08-28 19:07:42.761367-05
9	Admin Directo	87654321	\N	admin1@gmail.com	$2b$10$QovgccBUyzaSusHHl0DhWuQsmAqH5mtV5Sx84d9guaCxTlL0NQcZC	dueno	t	2026-08-28 19:11:28.419226-05
10	María García López	10101010	987654321	cliente1@gmail.com	$2b$10$DIyDc8oTjqBMSGDwhlFXb.S2JVFtImUsQF/GOeFPEIR.j04sEC7V6	cliente	t	2026-08-29 14:48:29.940947-05
11	Juan Rodríguez Martínez	10101011	987654322	cliente2@gmail.com	$2b$10$DIyDc8oTjqBMSGDwhlFXb.S2JVFtImUsQF/GOeFPEIR.j04sEC7V6	cliente	t	2026-08-29 14:48:29.940947-05
12	Carlos Mendez Flores	10101012	987654323	trabajador1@gmail.com	$2b$10$DIyDc8oTjqBMSGDwhlFXb.S2JVFtImUsQF/GOeFPEIR.j04sEC7V6	trabajador	t	2026-08-29 14:48:29.940947-05
13	Ana Velasco Ruiz	10101013	987654324	trabajador2@gmail.com	$2b$10$DIyDc8oTjqBMSGDwhlFXb.S2JVFtImUsQF/GOeFPEIR.j04sEC7V6	trabajador	t	2026-08-29 14:48:29.940947-05
\.


--
-- TOC entry 5222 (class 0 OID 0)
-- Dependencies: 221
-- Name: alquiler_eventos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.alquiler_eventos_id_seq', 1, true);


--
-- TOC entry 5223 (class 0 OID 0)
-- Dependencies: 223
-- Name: alquiler_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.alquiler_items_id_seq', 16, true);


--
-- TOC entry 5224 (class 0 OID 0)
-- Dependencies: 225
-- Name: alquileres_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.alquileres_id_seq', 7, true);


--
-- TOC entry 5225 (class 0 OID 0)
-- Dependencies: 227
-- Name: categorias_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.categorias_id_seq', 14, true);


--
-- TOC entry 5226 (class 0 OID 0)
-- Dependencies: 229
-- Name: cierre_garantia_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.cierre_garantia_id_seq', 1, true);


--
-- TOC entry 5227 (class 0 OID 0)
-- Dependencies: 232
-- Name: descuentos_cliente_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.descuentos_cliente_id_seq', 1, true);


--
-- TOC entry 5228 (class 0 OID 0)
-- Dependencies: 234
-- Name: pagos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.pagos_id_seq', 2, true);


--
-- TOC entry 5229 (class 0 OID 0)
-- Dependencies: 236
-- Name: paquete_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.paquete_items_id_seq', 58, true);


--
-- TOC entry 5230 (class 0 OID 0)
-- Dependencies: 238
-- Name: paquetes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.paquetes_id_seq', 10, true);


--
-- TOC entry 5231 (class 0 OID 0)
-- Dependencies: 240
-- Name: productos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.productos_id_seq', 38, true);


--
-- TOC entry 5232 (class 0 OID 0)
-- Dependencies: 242
-- Name: revision_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.revision_items_id_seq', 1, true);


--
-- TOC entry 5233 (class 0 OID 0)
-- Dependencies: 244
-- Name: stock_movimientos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.stock_movimientos_id_seq', 2, true);


--
-- TOC entry 5234 (class 0 OID 0)
-- Dependencies: 246
-- Name: usuarios_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.usuarios_id_seq', 13, true);


--
-- TOC entry 4964 (class 2606 OID 24808)
-- Name: alquiler_eventos alquiler_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alquiler_eventos
    ADD CONSTRAINT alquiler_eventos_pkey PRIMARY KEY (id);


--
-- TOC entry 4966 (class 2606 OID 24810)
-- Name: alquiler_items alquiler_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alquiler_items
    ADD CONSTRAINT alquiler_items_pkey PRIMARY KEY (id);


--
-- TOC entry 4969 (class 2606 OID 24812)
-- Name: alquileres alquileres_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alquileres
    ADD CONSTRAINT alquileres_pkey PRIMARY KEY (id);


--
-- TOC entry 4971 (class 2606 OID 24814)
-- Name: alquileres alquileres_qr_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alquileres
    ADD CONSTRAINT alquileres_qr_token_key UNIQUE (qr_token);


--
-- TOC entry 4976 (class 2606 OID 24816)
-- Name: categorias categorias_nombre_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_nombre_key UNIQUE (nombre);


--
-- TOC entry 4978 (class 2606 OID 24818)
-- Name: categorias categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_pkey PRIMARY KEY (id);


--
-- TOC entry 4980 (class 2606 OID 24820)
-- Name: cierre_garantia cierre_garantia_alquiler_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cierre_garantia
    ADD CONSTRAINT cierre_garantia_alquiler_id_key UNIQUE (alquiler_id);


--
-- TOC entry 4982 (class 2606 OID 24822)
-- Name: cierre_garantia cierre_garantia_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cierre_garantia
    ADD CONSTRAINT cierre_garantia_pkey PRIMARY KEY (id);


--
-- TOC entry 4984 (class 2606 OID 24824)
-- Name: configuracion configuracion_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.configuracion
    ADD CONSTRAINT configuracion_pkey PRIMARY KEY (clave);


--
-- TOC entry 4986 (class 2606 OID 24826)
-- Name: descuentos_cliente descuentos_cliente_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.descuentos_cliente
    ADD CONSTRAINT descuentos_cliente_pkey PRIMARY KEY (id);


--
-- TOC entry 4988 (class 2606 OID 24828)
-- Name: descuentos_cliente descuentos_cliente_usuario_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.descuentos_cliente
    ADD CONSTRAINT descuentos_cliente_usuario_id_key UNIQUE (usuario_id);


--
-- TOC entry 4990 (class 2606 OID 24830)
-- Name: pagos pagos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_pkey PRIMARY KEY (id);


--
-- TOC entry 4993 (class 2606 OID 24832)
-- Name: paquete_items paquete_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paquete_items
    ADD CONSTRAINT paquete_items_pkey PRIMARY KEY (id);


--
-- TOC entry 4995 (class 2606 OID 24834)
-- Name: paquetes paquetes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paquetes
    ADD CONSTRAINT paquetes_pkey PRIMARY KEY (id);


--
-- TOC entry 4997 (class 2606 OID 24836)
-- Name: productos productos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_pkey PRIMARY KEY (id);


--
-- TOC entry 5000 (class 2606 OID 24838)
-- Name: revision_items revision_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.revision_items
    ADD CONSTRAINT revision_items_pkey PRIMARY KEY (id);


--
-- TOC entry 5002 (class 2606 OID 24840)
-- Name: stock_movimientos stock_movimientos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_movimientos
    ADD CONSTRAINT stock_movimientos_pkey PRIMARY KEY (id);


--
-- TOC entry 5004 (class 2606 OID 24842)
-- Name: usuarios usuarios_correo_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_correo_key UNIQUE (correo);


--
-- TOC entry 5006 (class 2606 OID 24844)
-- Name: usuarios usuarios_dni_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_dni_key UNIQUE (dni);


--
-- TOC entry 5008 (class 2606 OID 24846)
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- TOC entry 4967 (class 1259 OID 24847)
-- Name: idx_alquiler_items_alq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_alquiler_items_alq ON public.alquiler_items USING btree (alquiler_id);


--
-- TOC entry 4972 (class 1259 OID 24848)
-- Name: idx_alquileres_cliente; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_alquileres_cliente ON public.alquileres USING btree (cliente_id);


--
-- TOC entry 4973 (class 1259 OID 24849)
-- Name: idx_alquileres_estado; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_alquileres_estado ON public.alquileres USING btree (estado);


--
-- TOC entry 4974 (class 1259 OID 24850)
-- Name: idx_alquileres_qr; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_alquileres_qr ON public.alquileres USING btree (qr_token);


--
-- TOC entry 4991 (class 1259 OID 24851)
-- Name: idx_paquete_items_paquete; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_paquete_items_paquete ON public.paquete_items USING btree (paquete_id);


--
-- TOC entry 4998 (class 1259 OID 24852)
-- Name: idx_revision_alquiler; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_revision_alquiler ON public.revision_items USING btree (alquiler_id);


--
-- TOC entry 5009 (class 2606 OID 24853)
-- Name: alquiler_eventos alquiler_eventos_alquiler_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alquiler_eventos
    ADD CONSTRAINT alquiler_eventos_alquiler_id_fkey FOREIGN KEY (alquiler_id) REFERENCES public.alquileres(id);


--
-- TOC entry 5010 (class 2606 OID 24858)
-- Name: alquiler_eventos alquiler_eventos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alquiler_eventos
    ADD CONSTRAINT alquiler_eventos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- TOC entry 5011 (class 2606 OID 24863)
-- Name: alquiler_items alquiler_items_alquiler_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alquiler_items
    ADD CONSTRAINT alquiler_items_alquiler_id_fkey FOREIGN KEY (alquiler_id) REFERENCES public.alquileres(id) ON DELETE CASCADE;


--
-- TOC entry 5012 (class 2606 OID 24868)
-- Name: alquiler_items alquiler_items_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alquiler_items
    ADD CONSTRAINT alquiler_items_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id);


--
-- TOC entry 5013 (class 2606 OID 24873)
-- Name: alquileres alquileres_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alquileres
    ADD CONSTRAINT alquileres_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.usuarios(id);


--
-- TOC entry 5014 (class 2606 OID 24878)
-- Name: cierre_garantia cierre_garantia_alquiler_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cierre_garantia
    ADD CONSTRAINT cierre_garantia_alquiler_id_fkey FOREIGN KEY (alquiler_id) REFERENCES public.alquileres(id);


--
-- TOC entry 5015 (class 2606 OID 24883)
-- Name: cierre_garantia cierre_garantia_cerrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cierre_garantia
    ADD CONSTRAINT cierre_garantia_cerrado_por_fkey FOREIGN KEY (cerrado_por) REFERENCES public.usuarios(id);


--
-- TOC entry 5016 (class 2606 OID 24888)
-- Name: descuentos_cliente descuentos_cliente_asignado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.descuentos_cliente
    ADD CONSTRAINT descuentos_cliente_asignado_por_fkey FOREIGN KEY (asignado_por) REFERENCES public.usuarios(id);


--
-- TOC entry 5017 (class 2606 OID 24893)
-- Name: descuentos_cliente descuentos_cliente_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.descuentos_cliente
    ADD CONSTRAINT descuentos_cliente_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- TOC entry 5018 (class 2606 OID 24898)
-- Name: pagos pagos_alquiler_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_alquiler_id_fkey FOREIGN KEY (alquiler_id) REFERENCES public.alquileres(id);


--
-- TOC entry 5019 (class 2606 OID 24903)
-- Name: pagos pagos_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuarios(id);


--
-- TOC entry 5020 (class 2606 OID 24908)
-- Name: paquete_items paquete_items_paquete_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paquete_items
    ADD CONSTRAINT paquete_items_paquete_id_fkey FOREIGN KEY (paquete_id) REFERENCES public.paquetes(id) ON DELETE CASCADE;


--
-- TOC entry 5021 (class 2606 OID 24913)
-- Name: paquete_items paquete_items_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.paquete_items
    ADD CONSTRAINT paquete_items_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id);


--
-- TOC entry 5022 (class 2606 OID 24918)
-- Name: productos productos_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id);


--
-- TOC entry 5023 (class 2606 OID 24923)
-- Name: revision_items revision_items_alquiler_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.revision_items
    ADD CONSTRAINT revision_items_alquiler_id_fkey FOREIGN KEY (alquiler_id) REFERENCES public.alquileres(id);


--
-- TOC entry 5024 (class 2606 OID 24928)
-- Name: revision_items revision_items_alquiler_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.revision_items
    ADD CONSTRAINT revision_items_alquiler_item_id_fkey FOREIGN KEY (alquiler_item_id) REFERENCES public.alquiler_items(id);


--
-- TOC entry 5025 (class 2606 OID 24933)
-- Name: stock_movimientos stock_movimientos_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_movimientos
    ADD CONSTRAINT stock_movimientos_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id);


--
-- TOC entry 5026 (class 2606 OID 24938)
-- Name: stock_movimientos stock_movimientos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_movimientos
    ADD CONSTRAINT stock_movimientos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- TOC entry 5207 (class 0 OID 0)
-- Dependencies: 6
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: postgres
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


-- Completed on 2026-08-29 14:59:33

--
-- PostgreSQL database dump complete
--

\unrestrict 0hCXNl2PO2DYoFfmmyzVWuyh1VfEDm6dAxpfesAebE9YPfKtfKyGjUTzixYCdzW

