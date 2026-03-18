--
-- PostgreSQL database dump
--

\restrict MxiHNnJoCc58fo2lNwbHSkCfjSeA3mDS4RHzH3wjqIYETFP9gzzidIbErJCF3hA

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.tasks DROP CONSTRAINT IF EXISTS tasks_product_id_products_id_fk;
ALTER TABLE IF EXISTS ONLY public.tasks DROP CONSTRAINT IF EXISTS tasks_created_by_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.tasks DROP CONSTRAINT IF EXISTS tasks_assigned_to_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.task_steps DROP CONSTRAINT IF EXISTS task_steps_task_id_fkey;
ALTER TABLE IF EXISTS ONLY public.task_steps DROP CONSTRAINT IF EXISTS task_steps_completed_by_fkey;
ALTER TABLE IF EXISTS ONLY public.products DROP CONSTRAINT IF EXISTS products_vendor_id_vendors_id_fk;
ALTER TABLE IF EXISTS ONLY public.password_reset_tokens DROP CONSTRAINT IF EXISTS password_reset_tokens_user_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_user_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_task_id_tasks_id_fk;
ALTER TABLE IF EXISTS ONLY public.audit_log DROP CONSTRAINT IF EXISTS audit_log_user_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.audit_log DROP CONSTRAINT IF EXISTS audit_log_task_id_tasks_id_fk;
DROP INDEX IF EXISTS public.idx_task_steps_task_id;
DROP INDEX IF EXISTS public.idx_task_steps_order;
DROP INDEX IF EXISTS public.idx_task_steps_completed;
DROP INDEX IF EXISTS public.idx_step_templates_order;
DROP INDEX IF EXISTS public.idx_step_templates_category;
DROP INDEX IF EXISTS public.idx_step_templates_active;
ALTER TABLE IF EXISTS ONLY public.vendors DROP CONSTRAINT IF EXISTS vendors_pkey;
ALTER TABLE IF EXISTS ONLY public.vendors DROP CONSTRAINT IF EXISTS vendors_name_unique;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_username_unique;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_email_unique;
ALTER TABLE IF EXISTS ONLY public.tasks DROP CONSTRAINT IF EXISTS tasks_pkey;
ALTER TABLE IF EXISTS ONLY public.task_steps DROP CONSTRAINT IF EXISTS task_steps_pkey;
ALTER TABLE IF EXISTS ONLY public.step_templates DROP CONSTRAINT IF EXISTS step_templates_pkey;
ALTER TABLE IF EXISTS ONLY public.session DROP CONSTRAINT IF EXISTS session_pkey;
ALTER TABLE IF EXISTS ONLY public.products DROP CONSTRAINT IF EXISTS products_pkey;
ALTER TABLE IF EXISTS ONLY public.password_reset_tokens DROP CONSTRAINT IF EXISTS password_reset_tokens_pkey;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_pkey;
ALTER TABLE IF EXISTS ONLY public.login_attempts DROP CONSTRAINT IF EXISTS login_attempts_pkey;
ALTER TABLE IF EXISTS ONLY public.audit_log DROP CONSTRAINT IF EXISTS audit_log_pkey;
ALTER TABLE IF EXISTS public.task_steps ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.step_templates ALTER COLUMN id DROP DEFAULT;
DROP TABLE IF EXISTS public.vendors;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.tasks;
DROP SEQUENCE IF EXISTS public.task_steps_id_seq;
DROP TABLE IF EXISTS public.task_steps;
DROP SEQUENCE IF EXISTS public.step_templates_id_seq;
DROP TABLE IF EXISTS public.step_templates;
DROP TABLE IF EXISTS public.session;
DROP TABLE IF EXISTS public.products;
DROP TABLE IF EXISTS public.password_reset_tokens;
DROP TABLE IF EXISTS public.notifications;
DROP TABLE IF EXISTS public.login_attempts;
DROP TABLE IF EXISTS public.audit_log;
DROP TYPE IF EXISTS public.status;
DROP TYPE IF EXISTS public.role;
DROP TYPE IF EXISTS public.priority;
DROP TYPE IF EXISTS public.account_status;
--
-- Name: account_status; Type: TYPE; Schema: public; Owner: shopsyncflow_user
--

CREATE TYPE public.account_status AS ENUM (
    'pending',
    'active',
    'suspended',
    'rejected'
);


ALTER TYPE public.account_status OWNER TO shopsyncflow_user;

--
-- Name: priority; Type: TYPE; Schema: public; Owner: shopsyncflow_user
--

CREATE TYPE public.priority AS ENUM (
    'high',
    'medium',
    'low'
);


ALTER TYPE public.priority OWNER TO shopsyncflow_user;

--
-- Name: role; Type: TYPE; Schema: public; Owner: shopsyncflow_user
--

CREATE TYPE public.role AS ENUM (
    'SuperAdmin',
    'WarehouseManager',
    'Editor',
    'Auditor'
);


ALTER TYPE public.role OWNER TO shopsyncflow_user;

--
-- Name: status; Type: TYPE; Schema: public; Owner: shopsyncflow_user
--

CREATE TYPE public.status AS ENUM (
    'NEW',
    'TRIAGE',
    'ASSIGNED',
    'IN_PROGRESS',
    'READY_FOR_REVIEW',
    'PUBLISHED',
    'QA_APPROVED',
    'DONE'
);


ALTER TYPE public.status OWNER TO shopsyncflow_user;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: shopsyncflow_user
--

CREATE TABLE public.audit_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    task_id character varying,
    user_id character varying NOT NULL,
    action text NOT NULL,
    from_status public.status,
    to_status public.status,
    details jsonb,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_log OWNER TO shopsyncflow_user;

--
-- Name: login_attempts; Type: TABLE; Schema: public; Owner: shopsyncflow_user
--

CREATE TABLE public.login_attempts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    ip_address text NOT NULL,
    user_agent text,
    success boolean NOT NULL,
    failure_reason text,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.login_attempts OWNER TO shopsyncflow_user;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: shopsyncflow_user
--

CREATE TABLE public.notifications (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    task_id character varying,
    title text NOT NULL,
    message text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notifications OWNER TO shopsyncflow_user;

--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: shopsyncflow_user
--

CREATE TABLE public.password_reset_tokens (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used boolean DEFAULT false NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.password_reset_tokens OWNER TO shopsyncflow_user;

--
-- Name: products; Type: TABLE; Schema: public; Owner: shopsyncflow_user
--

CREATE TABLE public.products (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    vendor text NOT NULL,
    order_number text,
    sku text,
    price text,
    category text,
    images text[],
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    vendor_id character varying
);


ALTER TABLE public.products OWNER TO shopsyncflow_user;

--
-- Name: session; Type: TABLE; Schema: public; Owner: shopsyncflow_user
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp without time zone NOT NULL
);


ALTER TABLE public.session OWNER TO shopsyncflow_user;

--
-- Name: step_templates; Type: TABLE; Schema: public; Owner: shopsyncflow_user
--

CREATE TABLE public.step_templates (
    id integer NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    description text,
    "order" integer NOT NULL,
    required boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.step_templates OWNER TO shopsyncflow_user;

--
-- Name: step_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: shopsyncflow_user
--

CREATE SEQUENCE public.step_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.step_templates_id_seq OWNER TO shopsyncflow_user;

--
-- Name: step_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: shopsyncflow_user
--

ALTER SEQUENCE public.step_templates_id_seq OWNED BY public.step_templates.id;


--
-- Name: task_steps; Type: TABLE; Schema: public; Owner: shopsyncflow_user
--

CREATE TABLE public.task_steps (
    id integer NOT NULL,
    task_id text NOT NULL,
    title text NOT NULL,
    description text,
    completed boolean DEFAULT false NOT NULL,
    "order" integer NOT NULL,
    required boolean DEFAULT false NOT NULL,
    completed_at timestamp without time zone,
    completed_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.task_steps OWNER TO shopsyncflow_user;

--
-- Name: task_steps_id_seq; Type: SEQUENCE; Schema: public; Owner: shopsyncflow_user
--

CREATE SEQUENCE public.task_steps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.task_steps_id_seq OWNER TO shopsyncflow_user;

--
-- Name: task_steps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: shopsyncflow_user
--

ALTER SEQUENCE public.task_steps_id_seq OWNED BY public.task_steps.id;


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: shopsyncflow_user
--

CREATE TABLE public.tasks (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    product_id character varying,
    title text NOT NULL,
    status public.status DEFAULT 'NEW'::public.status NOT NULL,
    priority public.priority DEFAULT 'medium'::public.priority NOT NULL,
    assigned_to character varying,
    created_by character varying NOT NULL,
    received_date timestamp without time zone NOT NULL,
    assigned_at timestamp without time zone,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    published_at timestamp without time zone,
    sla_deadline timestamp without time zone,
    notes text,
    checklist jsonb DEFAULT '{}'::jsonb,
    lead_time_minutes integer,
    cycle_time_minutes integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    order_number text,
    order_link text,
    description text,
    category text,
    attachments jsonb DEFAULT '[]'::jsonb,
    product_info jsonb
);


ALTER TABLE public.tasks OWNER TO shopsyncflow_user;

--
-- Name: users; Type: TABLE; Schema: public; Owner: shopsyncflow_user
--

CREATE TABLE public.users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    role public.role DEFAULT 'Editor'::public.role NOT NULL,
    first_name text,
    last_name text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    account_status public.account_status DEFAULT 'pending'::public.account_status NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    email_verification_token text,
    two_factor_secret text,
    two_factor_enabled boolean DEFAULT false NOT NULL,
    two_factor_backup_codes jsonb
);


ALTER TABLE public.users OWNER TO shopsyncflow_user;

--
-- Name: vendors; Type: TABLE; Schema: public; Owner: shopsyncflow_user
--

CREATE TABLE public.vendors (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    color character varying(7)
);


ALTER TABLE public.vendors OWNER TO shopsyncflow_user;

--
-- Name: step_templates id; Type: DEFAULT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.step_templates ALTER COLUMN id SET DEFAULT nextval('public.step_templates_id_seq'::regclass);


--
-- Name: task_steps id; Type: DEFAULT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.task_steps ALTER COLUMN id SET DEFAULT nextval('public.task_steps_id_seq'::regclass);


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: shopsyncflow_user
--

COPY public.audit_log (id, task_id, user_id, action, from_status, to_status, details, "timestamp") FROM stdin;
\.


--
-- Data for Name: login_attempts; Type: TABLE DATA; Schema: public; Owner: shopsyncflow_user
--

COPY public.login_attempts (id, email, ip_address, user_agent, success, failure_reason, "timestamp") FROM stdin;
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: shopsyncflow_user
--

COPY public.notifications (id, user_id, task_id, title, message, read, created_at) FROM stdin;
\.


--
-- Data for Name: password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: shopsyncflow_user
--

COPY public.password_reset_tokens (id, user_id, token_hash, expires_at, used, used_at, created_at) FROM stdin;
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: shopsyncflow_user
--

COPY public.products (id, title, description, vendor, order_number, sku, price, category, images, metadata, created_at, updated_at, vendor_id) FROM stdin;
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: shopsyncflow_user
--

COPY public.session (sid, sess, expire) FROM stdin;
\.


--
-- Data for Name: step_templates; Type: TABLE DATA; Schema: public; Owner: shopsyncflow_user
--

COPY public.step_templates (id, category, title, description, "order", required, active, created_at, updated_at) FROM stdin;
1	Product Image Editing	Download/receive product images from vendor	\N	1	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
2	Product Image Editing	Remove background (make white)	\N	2	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
3	Product Image Editing	Add drop shadow (subtle, professional)	\N	3	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
4	Product Image Editing	Center product in frame	\N	4	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
5	Product Image Editing	Resize to 2000x2000 pixels	\N	5	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
6	Product Image Editing	Remove wrinkles (if clothing)	\N	6	f	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
7	Product Image Editing	Remove visible tags/labels	\N	7	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
8	Product Image Editing	Color correction (if needed)	\N	8	f	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
9	Product Image Editing	Save optimized files (web-ready)	\N	9	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
10	Product Image Editing	Upload to image library	\N	10	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
11	Product Description Writing	Research product & competitors	\N	1	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
12	Product Description Writing	Write meta title (under 60 chars, keyword + brand)	\N	2	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
13	Product Description Writing	Write meta description (under 150 chars, USPs + CTA)	\N	3	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
14	Product Description Writing	Create H1 heading (one per page, keyword-focused)	\N	4	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
15	Product Description Writing	Write main description (300+ words minimum)	\N	5	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
16	Product Description Writing	Add bullet points (scannable features)	\N	6	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
17	Product Description Writing	Include internal links to related products	\N	7	f	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
18	Product Description Writing	Add keywords naturally (no stuffing)	\N	8	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
19	Product Description Writing	Write alt text for images (SEO)	\N	9	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
20	Product Description Writing	Proofread & check grammar	\N	10	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
21	Product Upload to Shopify	Verify images are ready (2000x2000, white BG)	\N	1	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
22	Product Upload to Shopify	Verify description is ready (SEO-optimized)	\N	2	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
23	Product Upload to Shopify	Enter product title	\N	3	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
24	Product Upload to Shopify	Enter product description	\N	4	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
25	Product Upload to Shopify	Upload images (first image = main)	\N	5	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
26	Product Upload to Shopify	Set pricing	\N	6	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
27	Product Upload to Shopify	Add SKU/barcode	\N	7	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
28	Product Upload to Shopify	Set inventory quantity	\N	8	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
29	Product Upload to Shopify	Add product tags/collections	\N	9	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
30	Product Upload to Shopify	Publish product	\N	10	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
31	Product Upload to Shopify	Verify product is live on site	\N	11	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
32	SEO Optimization	Check page titles (under 60 chars)	\N	1	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
33	SEO Optimization	Check meta descriptions (under 150 chars)	\N	2	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
34	SEO Optimization	Verify H1 heading structure	\N	3	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
35	SEO Optimization	Check keyword usage	\N	4	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
36	SEO Optimization	Add internal links	\N	5	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
37	SEO Optimization	Add schema markup (if applicable)	\N	6	f	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
38	SEO Optimization	Check breadcrumbs	\N	7	f	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
39	SEO Optimization	Optimize images (alt text, file size)	\N	8	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
40	SEO Optimization	Test page speed	\N	9	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
41	SEO Optimization	Submit to Google Search Console	\N	10	f	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
42	Content Writing	Research topic	\N	1	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
43	Content Writing	Create outline	\N	2	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
47	Content Writing	Add internal links	\N	6	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
48	Content Writing	Add images	\N	7	f	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
49	Content Writing	Proofread	\N	8	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
50	Content Writing	Publish	\N	9	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
51	Content Writing	Share on social media (if applicable)	\N	10	f	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
52	Quality Assurance	Check product images (2000x2000, white BG)	\N	1	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
53	Quality Assurance	Check product description (SEO compliance)	\N	2	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
54	Quality Assurance	Verify pricing is correct	\N	3	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
55	Quality Assurance	Test product page loads properly	\N	4	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
56	Quality Assurance	Check mobile responsiveness	\N	5	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
57	Quality Assurance	Verify all links work	\N	6	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
58	Quality Assurance	Check for typos/errors	\N	7	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
59	Quality Assurance	Approve or request revisions	\N	8	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
60	Other/General Tasks	Complete the task	\N	1	f	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
45	Content Writing	Optimize for keywords	\N	5	t	t	2025-10-26 19:59:55.005715	2025-10-27 00:34:05.043
44	Content Writing	Write draft (300+ words)	\N	4	t	t	2025-10-26 19:59:55.005715	2025-10-26 19:59:55.005715
46	Content Writing	Add headings (H2, H3, H4)	\N	3	t	t	2025-10-26 19:59:55.005715	2025-10-27 00:34:05.994
\.


--
-- Data for Name: task_steps; Type: TABLE DATA; Schema: public; Owner: shopsyncflow_user
--

COPY public.task_steps (id, task_id, title, description, completed, "order", required, completed_at, completed_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: shopsyncflow_user
--

COPY public.tasks (id, product_id, title, status, priority, assigned_to, created_by, received_date, assigned_at, started_at, completed_at, published_at, sla_deadline, notes, checklist, lead_time_minutes, cycle_time_minutes, created_at, updated_at, order_number, order_link, description, category, attachments, product_info) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: shopsyncflow_user
--

COPY public.users (id, username, email, password, role, first_name, last_name, created_at, updated_at, account_status, email_verified, email_verification_token, two_factor_secret, two_factor_enabled, two_factor_backup_codes) FROM stdin;
7693d534-1877-4453-9e89-646ea16397c8	admin	will@nexusclothing.com	b0777a5c146795643e62ed2313c2cc073653ea47a2f9035731992cdaed2f4735e52b53ec98cdb27958d7b04992d23d3cd73f99106a46bc2dd548f060d4a32381.611bc3d7b38e2fa5103a15fa1cd682b2	SuperAdmin	Will	Shawky	2025-09-17 04:02:09.698313	2025-10-24 02:36:03.246	active	f	\N	\N	f	\N
\.


--
-- Data for Name: vendors; Type: TABLE DATA; Schema: public; Owner: shopsyncflow_user
--

COPY public.vendors (id, name, created_at, updated_at, color) FROM stdin;
\.


--
-- Name: step_templates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: shopsyncflow_user
--

SELECT pg_catalog.setval('public.step_templates_id_seq', 60, true);


--
-- Name: task_steps_id_seq; Type: SEQUENCE SET; Schema: public; Owner: shopsyncflow_user
--

SELECT pg_catalog.setval('public.task_steps_id_seq', 30, true);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: login_attempts login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: step_templates step_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.step_templates
    ADD CONSTRAINT step_templates_pkey PRIMARY KEY (id);


--
-- Name: task_steps task_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.task_steps
    ADD CONSTRAINT task_steps_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: vendors vendors_name_unique; Type: CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_name_unique UNIQUE (name);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- Name: idx_step_templates_active; Type: INDEX; Schema: public; Owner: shopsyncflow_user
--

CREATE INDEX idx_step_templates_active ON public.step_templates USING btree (category, active);


--
-- Name: idx_step_templates_category; Type: INDEX; Schema: public; Owner: shopsyncflow_user
--

CREATE INDEX idx_step_templates_category ON public.step_templates USING btree (category);


--
-- Name: idx_step_templates_order; Type: INDEX; Schema: public; Owner: shopsyncflow_user
--

CREATE INDEX idx_step_templates_order ON public.step_templates USING btree (category, "order");


--
-- Name: idx_task_steps_completed; Type: INDEX; Schema: public; Owner: shopsyncflow_user
--

CREATE INDEX idx_task_steps_completed ON public.task_steps USING btree (task_id, completed);


--
-- Name: idx_task_steps_order; Type: INDEX; Schema: public; Owner: shopsyncflow_user
--

CREATE INDEX idx_task_steps_order ON public.task_steps USING btree (task_id, "order");


--
-- Name: idx_task_steps_task_id; Type: INDEX; Schema: public; Owner: shopsyncflow_user
--

CREATE INDEX idx_task_steps_task_id ON public.task_steps USING btree (task_id);


--
-- Name: audit_log audit_log_task_id_tasks_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_task_id_tasks_id_fk FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: audit_log audit_log_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: notifications notifications_task_id_tasks_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_task_id_tasks_id_fk FOREIGN KEY (task_id) REFERENCES public.tasks(id);


--
-- Name: notifications notifications_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: password_reset_tokens password_reset_tokens_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: products products_vendor_id_vendors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_vendor_id_vendors_id_fk FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);


--
-- Name: task_steps task_steps_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.task_steps
    ADD CONSTRAINT task_steps_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users(id);


--
-- Name: task_steps task_steps_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.task_steps
    ADD CONSTRAINT task_steps_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_assigned_to_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assigned_to_users_id_fk FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: tasks tasks_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: tasks tasks_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: shopsyncflow_user
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict MxiHNnJoCc58fo2lNwbHSkCfjSeA3mDS4RHzH3wjqIYETFP9gzzidIbErJCF3hA

