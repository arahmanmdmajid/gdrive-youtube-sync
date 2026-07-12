--
-- PostgreSQL database dump
--

\restrict f4XEvUlqm4n9nrXdioaksz6of7yWRw6ABgwFbtq8e4juk8VQeJFUdZu9SApvOde

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.jobs (
    id integer NOT NULL,
    drive_file_id text NOT NULL,
    drive_file_name text NOT NULL,
    drive_file_size_bytes bigint,
    drive_created_time text,
    status text DEFAULT 'needs_review'::text NOT NULL,
    proposed_title text,
    proposed_description text,
    youtube_video_id text,
    youtube_url text,
    youtube_title text,
    error_message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.jobs OWNER TO postgres;

--
-- Name: jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.jobs_id_seq OWNER TO postgres;

--
-- Name: jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.jobs_id_seq OWNED BY public.jobs.id;


--
-- Name: lecture_names; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lecture_names (
    id integer NOT NULL,
    name text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.lecture_names OWNER TO postgres;

--
-- Name: lecture_names_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.lecture_names_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.lecture_names_id_seq OWNER TO postgres;

--
-- Name: lecture_names_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.lecture_names_id_seq OWNED BY public.lecture_names.id;


--
-- Name: settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.settings (
    id integer NOT NULL,
    drive_folder_id text,
    drive_folder_name text,
    youtube_playlist_id text,
    youtube_playlist_name text,
    auto_sync boolean DEFAULT false NOT NULL,
    sync_interval_minutes integer DEFAULT 60 NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.settings OWNER TO postgres;

--
-- Name: settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.settings_id_seq OWNER TO postgres;

--
-- Name: settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.settings_id_seq OWNED BY public.settings.id;


--
-- Name: jobs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jobs ALTER COLUMN id SET DEFAULT nextval('public.jobs_id_seq'::regclass);


--
-- Name: lecture_names id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lecture_names ALTER COLUMN id SET DEFAULT nextval('public.lecture_names_id_seq'::regclass);


--
-- Name: settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.settings ALTER COLUMN id SET DEFAULT nextval('public.settings_id_seq'::regclass);


--
-- Data for Name: jobs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.jobs (id, drive_file_id, drive_file_name, drive_file_size_bytes, drive_created_time, status, proposed_title, proposed_description, youtube_video_id, youtube_url, youtube_title, error_message, created_at, updated_at) FROM stdin;
11	1Oo4YGgsiYNWiuUREhIAehtvbnJiJeU54	uys-vqbk-mnn (2026-05-19 17:39 GMT+5)	251962336	2026-05-19T16:37:02.540Z	done	Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø³ÙˆÙ… | Ù…. Ø§Ø³Ù„Ù… Ø´Ø§Û ØµØ§Ø­Ø¨ | 19-05-2026	Subject: Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø³ÙˆÙ…\nTeacher: Ù…. Ø§Ø³Ù„Ù… Ø´Ø§Û ØµØ§Ø­Ø¨\nDate: 19-05-2026\nSource file: uys-vqbk-mnn (2026-05-19 17:39 GMT+5)\nUploaded automatically by the class recording pipeline.	vWYmAUM9tFg	https://www.youtube.com/watch?v=vWYmAUM9tFg	Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø³ÙˆÙ… | Ù…. Ø§Ø³Ù„Ù… Ø´Ø§Û ØµØ§Ø­Ø¨ | 19-05-2026	\N	2026-06-07 17:34:42.587112	2026-06-08 12:17:42.635
9	1TqD4lox_tfn0uzvEW5TsyVHEWqWrY9gB	uys-vqbk-mnn (2026-05-19 17:39 GMT+5)	141017163	2026-05-19T15:21:19.986Z	done	Ø³Ø±Ø§Ø¬Ù‰ | Ù…. Ø®Ø§Ù„Ø¯ Ø²Ù…Ø§Ù† ØµØ§Ø­Ø¨ | 19-05-2026	Subject: Ø³Ø±Ø§Ø¬Ù‰\nTeacher: Ù…. Ø®Ø§Ù„Ø¯ Ø²Ù…Ø§Ù† ØµØ§Ø­Ø¨\nDate: 19-05-2026\nSource file: uys-vqbk-mnn (2026-05-19 17:39 GMT+5)\nUploaded automatically by the class recording pipeline.	AKWlgo7I_7Y	https://www.youtube.com/watch?v=AKWlgo7I_7Y	Ø³Ø±Ø§Ø¬Ù‰ | Ù…. Ø®Ø§Ù„Ø¯ Ø²Ù…Ø§Ù† ØµØ§Ø­Ø¨ | 19-05-2026	\N	2026-06-07 17:34:42.583888	2026-06-08 11:57:39.168
10	1SccKNC1Bqyp8zgF1xQIAbkoj6j56-PMs	uys-vqbk-mnn (2026-05-19 17:39 GMT+5)	175113160	2026-05-19T16:09:40.132Z	done	Ø§Ù„ÙÙˆØ² Ø§Ù„ÙƒØ¨ÙŠØ± | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨ | 19-05-2026	Subject: Ø§Ù„ÙÙˆØ² Ø§Ù„ÙƒØ¨ÙŠØ±\nTeacher: Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨\nDate: 19-05-2026\nSource file: uys-vqbk-mnn (2026-05-19 17:39 GMT+5)\nUploaded automatically by the class recording pipeline.	4ZAmfrNR3n0	https://www.youtube.com/watch?v=4ZAmfrNR3n0	Ø§Ù„ÙÙˆØ² Ø§Ù„ÙƒØ¨ÙŠØ± | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨ | 19-05-2026	\N	2026-06-07 17:34:42.585562	2026-06-08 12:07:50.561
14	1EvP-NULajQTImnneNi_BnphoLwsH_sQS	zeo-iaqz-qqu (2026-05-22 17:43 GMT+5)	172897767	2026-05-22T14:42:19.277Z	done	Ø¬Ù„Ø§Ù„ÙŠÙ† Ø§ÙˆÙ„ | Ù…. ÙÙŠØ§Ø¶ ØµØ§Ø­Ø¨ | 22-05-2026	Subject: Ø¬Ù„Ø§Ù„ÙŠÙ† Ø§ÙˆÙ„\nTeacher: Ù…. ÙÙŠØ§Ø¶ ØµØ§Ø­Ø¨\nDate: 22-05-2026\nSource file: zeo-iaqz-qqu (2026-05-22 17:43 GMT+5)\nUploaded automatically by the class recording pipeline.	EL1OlCXGQqg	https://www.youtube.com/watch?v=EL1OlCXGQqg	Ø¬Ù„Ø§Ù„ÙŠÙ† Ø§ÙˆÙ„ | Ù…. ÙÙŠØ§Ø¶ ØµØ§Ø­Ø¨ | 22-05-2026	\N	2026-06-07 17:34:42.597509	2026-06-08 12:28:26.185
8	1vR5_45_JtHozoZApFVX15uM6irTz8lo0	uys-vqbk-mnn (2026-05-19 17:39 GMT+5)	19351794	2026-05-19T14:24:05.489Z	done	Ø¬Ù„Ø§Ù„ÙŠÙ† Ø¯ÙˆÙ… | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨ | 2026-05-19	Subject: Ø¬Ù„Ø§Ù„ÙŠÙ† Ø¯ÙˆÙ…\nTeacher: Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨\nDate (PKT): 2026-05-19\nSource file: uys-vqbk-mnn (2026-05-19 17:39 GMT+5)\nUploaded automatically by the class recording pipeline.	84yMEKAiTr4	https://www.youtube.com/watch?v=84yMEKAiTr4	Ø¬Ù„Ø§Ù„ÙŠÙ† Ø¯ÙˆÙ… | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨ | 2026-05-19	\N	2026-06-07 17:34:42.582274	2026-06-08 11:56:36.413
16	1XepR4KeHTc1s5nCV8Ieo6SkThX5MHLIn	zeo-iaqz-qqu (2026-05-22 17:43 GMT+5)	303306062	2026-05-22T15:54:49.096Z	done	ØªÙˆØ¶ÙŠØ­ Ø§ÙˆÙ„ | Ù…. Ø¹ØªÙŠÙ‚ Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨ | 22-05-2026	Subject: ØªÙˆØ¶ÙŠØ­ Ø§ÙˆÙ„\nTeacher: Ù…. Ø¹ØªÙŠÙ‚ Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨\nDate: 22-05-2026\nSource file: zeo-iaqz-qqu (2026-05-22 17:43 GMT+5)\nUploaded automatically by the class recording pipeline.	22G6Dah8-ig	https://www.youtube.com/watch?v=22G6Dah8-ig	ØªÙˆØ¶ÙŠØ­ Ø§ÙˆÙ„ | Ù…. Ø¹ØªÙŠÙ‚ Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨ | 22-05-2026	\N	2026-06-07 17:34:42.600966	2026-06-08 12:31:17.379
17	1QNG_h88XXGskAWS0bdddHUoSWPpEjYfO	zeo-iaqz-qqu (2026-05-22 17:43 GMT+5)	153268122	2026-05-22T17:15:14.131Z	done	Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø¯ÙˆÙ… | Ù…. Ø³Ø¹ÙŠØ¯ Ø§Ù„Ø±Ø­Ù…Ù† ØµØ§Ø­Ø¨ | 22-05-2026	Subject: Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø¯ÙˆÙ…\nTeacher: Ù…. Ø³Ø¹ÙŠØ¯ Ø§Ù„Ø±Ø­Ù…Ù† ØµØ§Ø­Ø¨\nDate: 22-05-2026\nSource file: zeo-iaqz-qqu (2026-05-22 17:43 GMT+5)\nUploaded automatically by the class recording pipeline.	yqnC2S3jm-U	https://www.youtube.com/watch?v=yqnC2S3jm-U	Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø¯ÙˆÙ… | Ù…. Ø³Ø¹ÙŠØ¯ Ø§Ù„Ø±Ø­Ù…Ù† ØµØ§Ø­Ø¨ | 22-05-2026	\N	2026-06-07 17:34:42.602414	2026-06-08 14:15:42.391
13	1HGF2-164TFiwu9n4nNWTc6uMi5Scx15T	zeo-iaqz-qqu (2026-05-22 17:43 GMT+5)	129409868	2026-05-22T14:02:50.422Z	done	Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø§ÙˆÙ„ | Ù…. Ø³Ø±Ø§Ø¬ Ø§Ù„Ø­Ù‚ ØµØ§Ø­Ø¨ | 22-05-2026	Subject: Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø§ÙˆÙ„\nTeacher: Ù…. Ø³Ø±Ø§Ø¬ Ø§Ù„Ø­Ù‚ ØµØ§Ø­Ø¨\nDate: 22-05-2026\nSource file: zeo-iaqz-qqu (2026-05-22 17:43 GMT+5)\nUploaded automatically by the class recording pipeline.	88Cwx5QIJhU	https://www.youtube.com/watch?v=88Cwx5QIJhU	Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø§ÙˆÙ„ | Ù…. Ø³Ø±Ø§Ø¬ Ø§Ù„Ø­Ù‚ ØµØ§Ø­Ø¨ | 22-05-2026	\N	2026-06-07 17:34:42.589684	2026-06-08 12:21:42.081
18	1-jTm9sy__QXR_VeLO6DX9lVQUPGWcxHo	zeo-iaqz-qqu (2026-05-23 17:44 GMT+5)	151169809	2026-05-23T13:53:45.040Z	done	Ø¬Ù„Ø§Ù„ÙŠÙ† Ø§ÙˆÙ„ | Ù…. ÙÙŠØ§Ø¶ ØµØ§Ø­Ø¨ | 23-05-2026	Subject: Ø¬Ù„Ø§Ù„ÙŠÙ† Ø§ÙˆÙ„\nTeacher: Ù…. ÙÙŠØ§Ø¶ ØµØ§Ø­Ø¨\nDate: 23-05-2026\nSource file: zeo-iaqz-qqu (2026-05-23 17:44 GMT+5)\nUploaded automatically by the class recording pipeline.	1-BOiqz7Pig	https://www.youtube.com/watch?v=1-BOiqz7Pig	Ø¬Ù„Ø§Ù„ÙŠÙ† Ø§ÙˆÙ„ | Ù…. ÙÙŠØ§Ø¶ ØµØ§Ø­Ø¨ | 23-05-2026	\N	2026-06-07 17:34:42.603784	2026-06-08 14:15:08.687
15	1twd0l-lepTMy53vBXIrxh6sgbim9jN2V	zeo-iaqz-qqu (2026-05-22 17:43 GMT+5)	133478200	2026-05-22T15:21:24.279Z	done	Ø¬Ù„Ø§Ù„ÙŠÙ† Ø«Ù„Ø« | Ù…. ÙˆØ³ÙŠÙ… Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨ | 22-05-2026	Subject: Ø¬Ù„Ø§Ù„ÙŠÙ† Ø«Ù„Ø«\nTeacher: Ù…. ÙˆØ³ÙŠÙ… Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨\nDate: 22-05-2026\nSource file: zeo-iaqz-qqu (2026-05-22 17:43 GMT+5)\nUploaded automatically by the class recording pipeline.	zrT97yqtnvY	https://www.youtube.com/watch?v=zrT97yqtnvY	Ø¬Ù„Ø§Ù„ÙŠÙ† Ø«Ù„Ø« | Ù…. ÙˆØ³ÙŠÙ… Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨ | 22-05-2026	\N	2026-06-07 17:34:42.599348	2026-06-08 12:29:54.312
5	1XO2ACPpXuM6NUbRrpQQybDgwOFngF7ib	uys-vqbk-mnn (2026-05-18 17:41 GMT+5)	135708352	2026-05-18T15:17:19.655Z	done	Ø³Ø±Ø§Ø¬Ù‰ | Ù…. Ø®Ø§Ù„Ø¯ Ø²Ù…Ø§Ù† ØµØ§Ø­Ø¨ | 18-05-2026	Subject: Ø³Ø±Ø§Ø¬Ù‰\nTeacher: Ù…. Ø®Ø§Ù„Ø¯ Ø²Ù…Ø§Ù† ØµØ§Ø­Ø¨\nDate: 18-05-2026\nSource file: uys-vqbk-mnn (2026-05-18 17:41 GMT+5)\nUploaded automatically by the class recording pipeline.	A_VfPEqrOhE	https://www.youtube.com/watch?v=A_VfPEqrOhE	Ø³Ø±Ø§Ø¬Ù‰ | Ù…. Ø®Ø§Ù„Ø¯ Ø²Ù…Ø§Ù† ØµØ§Ø­Ø¨ | 18-05-2026	\N	2026-06-07 17:34:42.571563	2026-06-08 11:03:18.854
6	1p1keNbgdZCEa8OCQbqQF-gNTnLquGEPm	uys-vqbk-mnn (2026-05-18 17:41 GMT+5)	136842125	2026-05-18T15:52:38.453Z	done	Ø§Ù„ÙÙˆØ² Ø§Ù„ÙƒØ¨ÙŠØ± | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨ | 18-05-2026	Subject: Ø§Ù„ÙÙˆØ² Ø§Ù„ÙƒØ¨ÙŠØ±\nTeacher: Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨\nDate: 18-05-2026\nSource file: uys-vqbk-mnn (2026-05-18 17:41 GMT+5)\nUploaded automatically by the class recording pipeline.	jvGWZ1yUkhg	https://www.youtube.com/watch?v=jvGWZ1yUkhg	Ø§Ù„ÙÙˆØ² Ø§Ù„ÙƒØ¨ÙŠØ± | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨ | 18-05-2026	\N	2026-06-07 17:34:42.573122	2026-06-08 11:15:41.837
7	1dCyDsxjRoVsam1J03DbHVuqKeNDLMEsb	uys-vqbk-mnn (2026-05-18 17:41 GMT+5)	320721914	2026-05-18T16:42:28.863Z	done	Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø³ÙˆÙ… | Ù…. Ø§Ø³Ù„Ù… Ø´Ø§Û ØµØ§Ø­Ø¨ | 18-05-2026	Subject: Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø³ÙˆÙ…\nTeacher: Ù…. Ø§Ø³Ù„Ù… Ø´Ø§Û ØµØ§Ø­Ø¨\nDate: 18-05-2026\nSource file: uys-vqbk-mnn (2026-05-18 17:41 GMT+5)\nUploaded automatically by the class recording pipeline.	_5kS3Em_FXA	https://www.youtube.com/watch?v=_5kS3Em_FXA	Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø³ÙˆÙ… | Ù…. Ø§Ø³Ù„Ù… Ø´Ø§Û ØµØ§Ø­Ø¨ | 18-05-2026	\N	2026-06-07 17:34:42.580015	2026-06-08 11:54:07.832
24	1xMxZsbxvBH8Nm7IN59YtjYASVWH17eHH	zeo-iaqz-qqu (2026-05-23 17:44 GMT+5)	26608750	2026-05-23T16:36:22.059Z	done	Ø¯ÙŠÙˆØ§Ù† Ø­Ù…Ø§Ø³Û | Ù…. ÙØ±Ø§Ø² ØµØ§Ø­Ø¨ | 23-05-2026	Subject: Ø¯ÙŠÙˆØ§Ù† Ø­Ù…Ø§Ø³Û\nTeacher: Ù…. ÙØ±Ø§Ø² ØµØ§Ø­Ø¨\nDate: 23-05-2026\nSource file: zeo-iaqz-qqu (2026-05-23 17:44 GMT+5)\nUploaded automatically by the class recording pipeline.	XOGPEWhroaM	https://www.youtube.com/watch?v=XOGPEWhroaM	Ø¯ÙŠÙˆØ§Ù† Ø­Ù…Ø§Ø³Û | Ù…. ÙØ±Ø§Ø² ØµØ§Ø­Ø¨ | 23-05-2026	\N	2026-06-07 17:34:42.621122	2026-06-08 14:03:19.158
29	1hyuARUY9V3knwg2oPdXsdBqH4PWEQp8b	zeo-iaqz-qqu (2026-06-05 17:48 GMT+5)	95151899	2026-06-05T15:33:38.296Z	done	Ø¬Ù„Ø§Ù„ÙŠÙ† Ø«Ù„Ø« | Ù…. ÙˆØ³ÙŠÙ… Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨ | 05-06-2026	Subject: Ø¬Ù„Ø§Ù„ÙŠÙ† Ø«Ù„Ø«\nTeacher: Ù…. ÙˆØ³ÙŠÙ… Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨\nDate: 05-06-2026\nSource file: zeo-iaqz-qqu (2026-06-05 17:48 GMT+5)\nUploaded automatically by the class recording pipeline.	8wx1yC68-Rk	https://www.youtube.com/watch?v=8wx1yC68-Rk	Ø¬Ù„Ø§Ù„ÙŠÙ† Ø«Ù„Ø« | Ù…. ÙˆØ³ÙŠÙ… Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨ | 05-06-2026	\N	2026-06-07 17:34:42.634913	2026-06-08 14:18:09.735
31	1QWEx-HabkplLXcMGzfctizrkVYefwlIa	zeo-iaqz-qqu (2026-06-05 17:48 GMT+5)	76909710	2026-06-05T16:40:54.948Z	done	Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø¯ÙˆÙ… | Ù…. Ø³Ø¹ÙŠØ¯ Ø§Ù„Ø±Ø­Ù…Ù† ØµØ§Ø­Ø¨ | 05-06-2026	Subject: Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø¯ÙˆÙ…\nTeacher: Ù…. Ø³Ø¹ÙŠØ¯ Ø§Ù„Ø±Ø­Ù…Ù† ØµØ§Ø­Ø¨\nDate: 05-06-2026\nSource file: zeo-iaqz-qqu (2026-06-05 17:48 GMT+5)\nUploaded automatically by the class recording pipeline.	asXPWSPMk8M	https://www.youtube.com/watch?v=asXPWSPMk8M	Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø¯ÙˆÙ… | Ù…. Ø³Ø¹ÙŠØ¯ Ø§Ù„Ø±Ø­Ù…Ù† ØµØ§Ø­Ø¨ | 05-06-2026	\N	2026-06-07 17:34:42.637495	2026-06-08 14:37:36.709
20	1mVKql0vcVfzZXHm8RDgQIWqQLOLqzpmq	zeo-iaqz-qqu (2026-05-23 17:44 GMT+5)	57161280	2026-05-23T14:32:49.587Z	done	Ø¬Ù„Ø§Ù„ÙŠÙ† Ø«Ù„Ø« | Ù…. ÙˆØ³ÙŠÙ… Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨ | 23-05-2026	Subject: Ø¬Ù„Ø§Ù„ÙŠÙ† Ø«Ù„Ø«\nTeacher: Ù…. ÙˆØ³ÙŠÙ… Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨\nDate: 23-05-2026\nSource file: zeo-iaqz-qqu (2026-05-23 17:44 GMT+5)\nUploaded automatically by the class recording pipeline.	UcOU77yluLY	https://www.youtube.com/watch?v=UcOU77yluLY	Ø¬Ù„Ø§Ù„ÙŠÙ† Ø«Ù„Ø« | Ù…. ÙˆØ³ÙŠÙ… Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨ | 23-05-2026	\N	2026-06-07 17:34:42.615542	2026-06-08 14:16:17.979
23	1LVMz5AuaZlefuGS1zBIDcEOTEB78LE7b	zeo-iaqz-qqu (2026-05-23 17:44 GMT+5)	245651753	2026-05-23T16:18:29.167Z	done	ØªÙˆØ¶ÙŠØ­ Ø§ÙˆÙ„ | Ù…. Ø¹ØªÙŠÙ‚ Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨ | 23-05-2026	Subject: ØªÙˆØ¶ÙŠØ­ Ø§ÙˆÙ„\nTeacher: Ù…. Ø¹ØªÙŠÙ‚ Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨\nDate: 23-05-2026\nSource file: zeo-iaqz-qqu (2026-05-23 17:44 GMT+5)\nUploaded automatically by the class recording pipeline.	vaenawe0_G0	https://www.youtube.com/watch?v=vaenawe0_G0	ØªÙˆØ¶ÙŠØ­ Ø§ÙˆÙ„ | Ù…. Ø¹ØªÙŠÙ‚ Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨ | 23-05-2026	\N	2026-06-07 17:34:42.619776	2026-06-08 14:02:55.364
26	1K4CQeWeGgqpzWiRS_Yazo4JWo9NO0OFF	zeo-iaqz-qqu (2026-06-05 17:48 GMT+5)	106722986	2026-06-05T14:03:53.775Z	done	Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø§ÙˆÙ„ | Ù…. Ø³Ø±Ø§Ø¬ Ø§Ù„Ø­Ù‚ ØµØ§Ø­Ø¨ | 05-06-2026	Subject: Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø§ÙˆÙ„\nTeacher: Ù…. Ø³Ø±Ø§Ø¬ Ø§Ù„Ø­Ù‚ ØµØ§Ø­Ø¨\nDate: 05-06-2026\nSource file: zeo-iaqz-qqu (2026-06-05 17:48 GMT+5)\nUploaded automatically by the class recording pipeline.	6gXo9S7UIiE	https://www.youtube.com/watch?v=6gXo9S7UIiE	Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø§ÙˆÙ„ | Ù…. Ø³Ø±Ø§Ø¬ Ø§Ù„Ø­Ù‚ ØµØ§Ø­Ø¨ | 05-06-2026	\N	2026-06-07 17:34:42.62944	2026-06-08 12:30:39.399
32	1RuofGVJZbzIOCsDajL2iI_ZLCMhuXQNq	zeo-iaqz-qqu (2026-06-05 17:48 GMT+5)	360344778	2026-06-05T16:43:28.877Z	done	Ø¯ÙŠÙˆØ§Ù† Ø­Ù…Ø§Ø³Û | Ù…. ÙØ±Ø§Ø² ØµØ§Ø­Ø¨ | 05-06-2026	Subject: Ø¯ÙŠÙˆØ§Ù† Ø­Ù…Ø§Ø³Û\nTeacher: Ù…. ÙØ±Ø§Ø² ØµØ§Ø­Ø¨\nDate: 05-06-2026\nSource file: zeo-iaqz-qqu (2026-06-05 17:48 GMT+5)\nUploaded automatically by the class recording pipeline.	fuVOhK5_H8A	https://www.youtube.com/watch?v=fuVOhK5_H8A	Ø¯ÙŠÙˆØ§Ù† Ø­Ù…Ø§Ø³Û | Ù…. ÙØ±Ø§Ø² ØµØ§Ø­Ø¨ | 05-06-2026	\N	2026-06-07 17:34:42.638728	2026-06-08 15:07:41.715
27	1T9fh9Zel176_GD9Sormw0lvzJhjc71mH	zeo-iaqz-qqu (2026-06-05 17:48 GMT+5)	121809411	2026-06-05T14:16:00.828Z	done	Ø¬Ù„Ø§Ù„ÙŠÙ† Ø§ÙˆÙ„ | Ù…. ÙÙŠØ§Ø¶ ØµØ§Ø­Ø¨ | 05-06-2026	Subject: Ø¬Ù„Ø§Ù„ÙŠÙ† Ø§ÙˆÙ„\nTeacher: Ù…. ÙÙŠØ§Ø¶ ØµØ§Ø­Ø¨\nDate: 05-06-2026\nSource file: zeo-iaqz-qqu (2026-06-05 17:48 GMT+5)\nUploaded automatically by the class recording pipeline.	QonHp_5jQh8	https://www.youtube.com/watch?v=QonHp_5jQh8	Ø¬Ù„Ø§Ù„ÙŠÙ† Ø§ÙˆÙ„ | Ù…. ÙÙŠØ§Ø¶ ØµØ§Ø­Ø¨ | 05-06-2026	\N	2026-06-07 17:34:42.632311	2026-06-08 12:31:20.194
98	19MhIxJe73-pMUBSvrJKNEw6SWPGE3_mJ	zeo-iaqz-qqu (2026-06-13 17:51 GMT+5)	82456697	2026-06-13T15:40:19.013Z	done	3.1 Hidaya Sani Part 1 | Ustad Sirajul Haq | 13-06-2026	Subject: Hidaya Sani Part 1\nTeacher: Ustad Sirajul Haq\nDate: 13-06-2026\nSource file: zeo-iaqz-qqu (2026-06-13 17:51 GMT+5)\nUploaded automatically by the class recording pipeline.	iNz-Ed_0tIU	https://www.youtube.com/watch?v=iNz-Ed_0tIU	3.1 Hidaya Sani Part 1 | Ustad Sirajul Haq | 13-06-2026	\N	2026-06-16 19:54:58.802395	2026-06-16 19:14:01.42
35	1ejfNWU27hH217h2x8zerDbiy0kRB4G5o	zeo-iaqz-qqu (2026-06-06 17:51 GMT+5)	63823706	2026-06-06T14:54:23.757Z	done	Ø¬Ù„Ø§Ù„ÙŠÙ† Ø«Ù„Ø« | Ù…. ÙˆØ³ÙŠÙ… Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨ | 06-06-2026	Subject: Ø¬Ù„Ø§Ù„ÙŠÙ† Ø«Ù„Ø«\nTeacher: Ù…. ÙˆØ³ÙŠÙ… Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨\nDate: 06-06-2026\nSource file: zeo-iaqz-qqu (2026-06-06 17:51 GMT+5)\nUploaded automatically by the class recording pipeline.	tw1lK-9AIHk	https://www.youtube.com/watch?v=tw1lK-9AIHk	Ø¬Ù„Ø§Ù„ÙŠÙ† Ø«Ù„Ø« | Ù…. ÙˆØ³ÙŠÙ… Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨ | 06-06-2026	\N	2026-06-07 17:34:42.65035	2026-06-08 15:09:20.066
96	1G1GdUWtuU5CYBfyd-tgZe87HTogPR2px	zeo-iaqz-qqu (2026-06-13 17:51 GMT+5)	29757586	2026-06-13T14:19:58.402Z	done	1.3 Jalalain Part 3 | Ustad Wasimullah | 13-06-2026	Subject: Jalalain Part 3\nTeacher: Ustad Wasimullah\nDate: 13-06-2026\nSource file: zeo-iaqz-qqu (2026-06-13 17:51 GMT+5)\nUploaded automatically by the class recording pipeline.	UNLA8C-YAq0	https://www.youtube.com/watch?v=UNLA8C-YAq0	1.3 Jalalain Part 3 | Ustad Wasimullah | 13-06-2026	\N	2026-06-16 19:54:58.800249	2026-06-16 19:09:10.395
97	1jopjKmH4iYSbOYOE1-M1AIMqOFxlXdPL	zeo-iaqz-qqu (2026-06-13 17:51 GMT+5)	84966059	2026-06-13T15:29:36.021Z	done	2.2 Kitab ul Asar | Ustad Haseeb | 13-06-2026	Subject: Kitab ul Asar\nTeacher: Ustad Haseeb\nDate: 13-06-2026\nSource file: zeo-iaqz-qqu (2026-06-13 17:51 GMT+5)\nUploaded automatically by the class recording pipeline.	ftz7gY79Afs	https://www.youtube.com/watch?v=ftz7gY79Afs	2.2 Kitab ul Asar | Ustad Haseeb | 13-06-2026	\N	2026-06-16 19:54:58.801429	2026-06-16 19:14:32.154
95	1QqenBDo5FIHNcxPKyUklQtJ8Jl0ImU9W	zeo-iaqz-qqu (2026-06-13 17:51 GMT+5)	99863938	2026-06-13T14:15:16.517Z	done	5.1 Sharah Aqaid | Ustad Khalid Zaman | 13-06-2026	Subject: Sharah Aqaid\nTeacher: Ustad Khalid Zaman\nDate: 13-06-2026\nSource file: zeo-iaqz-qqu (2026-06-13 17:51 GMT+5)\nUploaded automatically by the class recording pipeline.	pH9zoklEc4w	https://www.youtube.com/watch?v=pH9zoklEc4w	5.1 Sharah Aqaid | Ustad Khalid Zaman | 13-06-2026	\N	2026-06-16 19:54:58.79899	2026-06-16 19:11:42.671
42	12p9BXXN8vqO4-xRUwV0PUUyUf_BHgqGm	zeo-iaqz-qqu (2026-05-22 17:43 GMT+5)	2134357	2026-05-22T13:04:18.890Z	rejected	3.1 | 22-05-2026 | Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø§ÙˆÙ„ | Ù…. Ø³Ø±Ø§Ø¬ Ø§Ù„Ø­Ù‚ ØµØ§Ø­Ø¨	Subject: Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø§ÙˆÙ„\nTeacher: Ù…. Ø³Ø±Ø§Ø¬ Ø§Ù„Ø­Ù‚ ØµØ§Ø­Ø¨\nDate: 22-05-2026\nSource file: zeo-iaqz-qqu (2026-05-22 17:43 GMT+5)\nUploaded automatically by the class recording pipeline.	\N	\N	\N	\N	2026-06-08 13:20:52.369156	2026-06-10 11:53:06.165
19	1zlRygATOBIfhyRwXBsrifdlT3gDuuZq2	zeo-iaqz-qqu (2026-05-23 17:44 GMT+5)	106894592	2026-05-23T14:32:25.164Z	done	Ø´Ø±Ø­ Ø¹Ù‚Ø§Ø¦Ø¯ | Ù…. Ø®Ø§Ù„Ø¯ Ø²Ù…Ø§Ù† ØµØ§Ø­Ø¨ | 23-05-2026	Subject: Ø´Ø±Ø­ Ø¹Ù‚Ø§Ø¦Ø¯\nTeacher: Ù…. Ø®Ø§Ù„Ø¯ Ø²Ù…Ø§Ù† ØµØ§Ø­Ø¨\nDate: 23-05-2026\nSource file: zeo-iaqz-qqu (2026-05-23 17:44 GMT+5)\nUploaded automatically by the class recording pipeline.	xYc8l8jzRtM	https://www.youtube.com/watch?v=xYc8l8jzRtM	Ø´Ø±Ø­ Ø¹Ù‚Ø§Ø¦Ø¯ | Ù…. Ø®Ø§Ù„Ø¯ Ø²Ù…Ø§Ù† ØµØ§Ø­Ø¨ | 23-05-2026	\N	2026-06-07 17:34:42.605163	2026-06-08 14:15:53.181
2	1AdN5zIT49f8l5WUwdF-MGRXpOqurSf6X	uys-vqbk-mnn (2026-05-18 17:41 GMT+5)	147492150	2026-05-18T14:22:44.268Z	done	Ø¬Ù„Ø§Ù„ÙŠÙ† Ø¯ÙˆÙ… | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨ | 18-05-2026	Subject: Ø¬Ù„Ø§Ù„ÙŠÙ† Ø¯ÙˆÙ…\nTeacher: Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨\nDate: 18-05-2026\nSource file: uys-vqbk-mnn (2026-05-18 17:41 GMT+5)\nUploaded automatically by the class recording pipeline.	4cpnaYjgvUA	https://www.youtube.com/watch?v=4cpnaYjgvUA	Ø¬Ù„Ø§Ù„ÙŠÙ† Ø¯ÙˆÙ… | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨ | 18-05-2026	\N	2026-06-07 17:34:42.565993	2026-06-08 10:46:22.446
37	1YwSr2nEo4XoUJYixoCgfRW-nIKQ2Yi6Q	zeo-iaqz-qqu (2026-06-06 17:51 GMT+5)	118731777	2026-06-06T15:30:29.350Z	done	Ø´Ø±Ø­ Ø¹Ù‚Ø§Ø¦Ø¯ | Ù…. Ø®Ø§Ù„Ø¯ Ø²Ù…Ø§Ù† ØµØ§Ø­Ø¨ | 06-06-2026	Subject: Ø´Ø±Ø­ Ø¹Ù‚Ø§Ø¦Ø¯\nTeacher: Ù…. Ø®Ø§Ù„Ø¯ Ø²Ù…Ø§Ù† ØµØ§Ø­Ø¨\nDate: 06-06-2026\nSource file: zeo-iaqz-qqu (2026-06-06 17:51 GMT+5)\nUploaded automatically by the class recording pipeline.	ygSXSuQzVl0	https://www.youtube.com/watch?v=ygSXSuQzVl0	Ø´Ø±Ø­ Ø¹Ù‚Ø§Ø¦Ø¯ | Ù…. Ø®Ø§Ù„Ø¯ Ø²Ù…Ø§Ù† ØµØ§Ø­Ø¨ | 06-06-2026	\N	2026-06-07 17:34:42.652944	2026-06-08 14:01:25.244
38	1obAKEL5ia14qZjz6mkgWsDLHO1iKfHFY	zeo-iaqz-qqu (2026-06-06 17:51 GMT+5)	109495376	2026-06-06T15:48:08.177Z	done	Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø§ÙˆÙ„ | Ù…. Ø³Ø±Ø§Ø¬ Ø§Ù„Ø­Ù‚ ØµØ§Ø­Ø¨ | 06-06-2026	Subject: Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø§ÙˆÙ„\nTeacher: Ù…. Ø³Ø±Ø§Ø¬ Ø§Ù„Ø­Ù‚ ØµØ§Ø­Ø¨\nDate: 06-06-2026\nSource file: zeo-iaqz-qqu (2026-06-06 17:51 GMT+5)\nUploaded automatically by the class recording pipeline.	fUuyTHBn2W4	https://www.youtube.com/watch?v=fUuyTHBn2W4	Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø§ÙˆÙ„ | Ù…. Ø³Ø±Ø§Ø¬ Ø§Ù„Ø­Ù‚ ØµØ§Ø­Ø¨ | 06-06-2026	\N	2026-06-07 17:34:42.654296	2026-06-08 14:02:38.203
3	1dsrpfqIFLMLtBeXfgOuEb66qrHjo4ZtF	uys-vqbk-mnn (2026-05-18 17:41 GMT+5)	32877621	2026-05-18T14:33:16.240Z	done	Ù…ØªÙ† Ø§Ù„ÙƒØ§ÙÙŠØŒ Ø§Ù„Ù‡ÙŠØ¦Ø© Ø§Ù„ØµØºØ±Ù‰ | Ù…. Ø¹Ø§Ù…Ø± Ø§Ù‚Ø¨Ø§Ù„ ØµØ§Ø­Ø¨ | 18-05-2026 | Part 1	Subject: Ù…ØªÙ† Ø§Ù„ÙƒØ§ÙÙŠØŒ Ø§Ù„Ù‡ÙŠØ¦Ø© Ø§Ù„ØµØºØ±Ù‰\nTeacher: Ù…. Ø¹Ø§Ù…Ø± Ø§Ù‚Ø¨Ø§Ù„ ØµØ§Ø­Ø¨\nDate: 18-05-2026\nSource file: uys-vqbk-mnn (2026-05-18 17:41 GMT+5)\nUploaded automatically by the class recording pipeline.	XwQYoNEOwZQ	https://www.youtube.com/watch?v=XwQYoNEOwZQ	Ù…ØªÙ† Ø§Ù„ÙƒØ§ÙÙŠØŒ Ø§Ù„Ù‡ÙŠØ¦Ø© Ø§Ù„ØµØºØ±Ù‰ | Ù…. Ø¹Ø§Ù…Ø± Ø§Ù‚Ø¨Ø§Ù„ ØµØ§Ø­Ø¨ | 18-05-2026 | Part 1	\N	2026-06-07 17:34:42.568422	2026-06-08 10:48:54.568
1	15t3DG9Ej43eVplHxm-wJOgL29Ov8_KGh	uys-vqbk-mnn (2026-05-18 17:41 GMT+5)	330046450	2026-05-18T13:53:59.490Z	done	ØªÙˆØ¶ÙŠØ­ Ø¯ÙˆÙ… | Ù…. Ø³Ø¹ÙŠØ¯ Ø§Ù„Ø±Ø­Ù…Ù† ØµØ§Ø­Ø¨ | 18-05-2026	Subject: ØªÙˆØ¶ÙŠØ­ Ø¯ÙˆÙ…\nTeacher: Ù…. Ø³Ø¹ÙŠØ¯ Ø§Ù„Ø±Ø­Ù…Ù† ØµØ§Ø­Ø¨\nDate: 18-05-2026\nSource file: uys-vqbk-mnn (2026-05-18 17:41 GMT+5)\nUploaded automatically by the class recording pipeline.	2QUMB_uAOU0	https://www.youtube.com/watch?v=2QUMB_uAOU0	ØªÙˆØ¶ÙŠØ­ Ø¯ÙˆÙ… | Ù…. Ø³Ø¹ÙŠØ¯ Ø§Ù„Ø±Ø­Ù…Ù† ØµØ§Ø­Ø¨ | 18-05-2026	\N	2026-06-07 17:34:42.546858	2026-06-08 12:28:08.712
39	10qlzyV0ARzuhQbrn-3lCxhT10aXYLYbj	zeo-iaqz-qqu (2026-06-06 17:51 GMT+5)	59028325	2026-06-06T16:00:58.445Z	done	ØªÙˆØ¶ÙŠØ­ Ø§ÙˆÙ„ | Ù…. Ø¹ØªÙŠÙ‚ Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨ | 06-06-2026	Subject: ØªÙˆØ¶ÙŠØ­ Ø§ÙˆÙ„\nTeacher: Ù…. Ø¹ØªÙŠÙ‚ Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨\nDate: 06-06-2026\nSource file: zeo-iaqz-qqu (2026-06-06 17:51 GMT+5)\nUploaded automatically by the class recording pipeline.	B0qtH5vKCn4	https://www.youtube.com/watch?v=B0qtH5vKCn4	ØªÙˆØ¶ÙŠØ­ Ø§ÙˆÙ„ | Ù…. Ø¹ØªÙŠÙ‚ Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨ | 06-06-2026	\N	2026-06-07 17:34:42.655595	2026-06-08 14:03:20.225
36	1Z5ze6JV4GTWU60RtxKetNeEGEEWvQppm	zeo-iaqz-qqu (2026-06-06 17:51 GMT+5)	100104616	2026-06-06T15:23:29.481Z	done	ÙƒØªØ§Ø¨ Ø§Ù„Ø¢Ø«Ø§Ø±ØŒ Ø®ÙŠØ± Ø§Ù„Ø£ØµÙˆÙ„ | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨ | 06-06-2026	Subject: ÙƒØªØ§Ø¨ Ø§Ù„Ø¢Ø«Ø§Ø±ØŒ Ø®ÙŠØ± Ø§Ù„Ø£ØµÙˆÙ„\nTeacher: Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨\nDate: 06-06-2026\nSource file: zeo-iaqz-qqu (2026-06-06 17:51 GMT+5)\nUploaded automatically by the class recording pipeline.	ukK-4zhbu6s	https://www.youtube.com/watch?v=ukK-4zhbu6s	ÙƒØªØ§Ø¨ Ø§Ù„Ø¢Ø«Ø§Ø±ØŒ Ø®ÙŠØ± Ø§Ù„Ø£ØµÙˆÙ„ | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨ | 06-06-2026	\N	2026-06-07 17:34:42.651627	2026-06-08 15:10:31.844
101	1HW816VpFWr6-WjdaPcynKsyr3j1fLx4t	zeo-iaqz-qqu (2026-06-13 17:51 GMT+5)	198384429	2026-06-13T17:40:15.004Z	done	3.2 Hidaya Sani Part 2 | Ustad Saeedur Rahman | 13-06-2026	Subject: Hidaya Sani Part 2\nTeacher: Ustad Saeedur Rahman\nDate: 13-06-2026\nSource file: zeo-iaqz-qqu (2026-06-13 17:51 GMT+5)\nUploaded automatically by the class recording pipeline.	g31c9EjU6P4	https://www.youtube.com/watch?v=g31c9EjU6P4	3.2 Hidaya Sani Part 2 | Ustad Saeedur Rahman | 13-06-2026	\N	2026-06-16 19:54:58.805586	2026-06-16 19:20:13.55
4	1MraqLHeojyCaQ0xnKaGCidZ5vefqG1ho	uys-vqbk-mnn (2026-05-18 17:41 GMT+5)	23508933	2026-05-18T14:44:29.706Z	done	Ù…ØªÙ† Ø§Ù„ÙƒØ§ÙÙŠØŒ Ø§Ù„Ù‡ÙŠØ¦Ø© Ø§Ù„ØµØºØ±Ù‰ | Ù…. Ø¹Ø§Ù…Ø± Ø§Ù‚Ø¨Ø§Ù„ ØµØ§Ø­Ø¨ | 18-05-2026 | Part 2	Subject: Ù…ØªÙ† Ø§Ù„ÙƒØ§ÙÙŠØŒ Ø§Ù„Ù‡ÙŠØ¦Ø© Ø§Ù„ØµØºØ±Ù‰\nTeacher: Ù…. Ø¹Ø§Ù…Ø± Ø§Ù‚Ø¨Ø§Ù„ ØµØ§Ø­Ø¨\nDate: 18-05-2026\nSource file: uys-vqbk-mnn (2026-05-18 17:41 GMT+5)\nUploaded automatically by the class recording pipeline.	oa7kOfVomaY	https://www.youtube.com/watch?v=oa7kOfVomaY	Ù…ØªÙ† Ø§Ù„ÙƒØ§ÙÙŠØŒ Ø§Ù„Ù‡ÙŠØ¦Ø© Ø§Ù„ØµØºØ±Ù‰ | Ù…. Ø¹Ø§Ù…Ø± Ø§Ù‚Ø¨Ø§Ù„ ØµØ§Ø­Ø¨ | 18-05-2026 | Part 2	\N	2026-06-07 17:34:42.569973	2026-06-08 10:50:42.596
22	1EgtUp6XEdexsUHEiUCsMSydNHUPoOqUt	zeo-iaqz-qqu (2026-05-23 17:44 GMT+5)	95042349	2026-05-23T15:42:30.725Z	done	Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø§ÙˆÙ„ | Ù…. Ø³Ø±Ø§Ø¬ Ø§Ù„Ø­Ù‚ ØµØ§Ø­Ø¨ | 23-05-2026	Subject: Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø§ÙˆÙ„\nTeacher: Ù…. Ø³Ø±Ø§Ø¬ Ø§Ù„Ø­Ù‚ ØµØ§Ø­Ø¨\nDate: 23-05-2026\nSource file: zeo-iaqz-qqu (2026-05-23 17:44 GMT+5)\nUploaded automatically by the class recording pipeline.	iYyxGgqX9wY	https://www.youtube.com/watch?v=iYyxGgqX9wY	Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø§ÙˆÙ„ | Ù…. Ø³Ø±Ø§Ø¬ Ø§Ù„Ø­Ù‚ ØµØ§Ø­Ø¨ | 23-05-2026	\N	2026-06-07 17:34:42.618369	2026-06-08 14:17:23.84
99	1749b3XdbWzrITaj4Io9ZhrGL0O49GwGQ	zeo-iaqz-qqu (2026-06-13 17:51 GMT+5)	310952401	2026-06-13T16:20:40.678Z	done	4.1 Tawzeeh Part 1 | Ustad Atiqullah | 13-06-2026	Subject: Tawzeeh Part 1\nTeacher: Ustad Atiqullah\nDate: 13-06-2026\nSource file: zeo-iaqz-qqu (2026-06-13 17:51 GMT+5)\nUploaded automatically by the class recording pipeline.	_QkxSb-8gII	https://www.youtube.com/watch?v=_QkxSb-8gII	4.1 Tawzeeh Part 1 | Ustad Atiqullah | 13-06-2026	\N	2026-06-16 19:54:58.803408	2026-06-16 19:20:44.639
28	1iRPZnfzp7mwyjDyxHsQ2FYl5o00nmEA3	zeo-iaqz-qqu (2026-06-05 17:48 GMT+5)	72980301	2026-06-05T14:49:50.569Z	done	ÙƒØªØ§Ø¨ Ø§Ù„Ø¢Ø«Ø§Ø±ØŒ Ø®ÙŠØ± Ø§Ù„Ø£ØµÙˆÙ„ | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨ | 05-06-2026	Subject: ÙƒØªØ§Ø¨ Ø§Ù„Ø¢Ø«Ø§Ø±ØŒ Ø®ÙŠØ± Ø§Ù„Ø£ØµÙˆÙ„\nTeacher: Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨\nDate: 05-06-2026\nSource file: zeo-iaqz-qqu (2026-06-05 17:48 GMT+5)\nUploaded automatically by the class recording pipeline.	YjX7fDuSq3Y	https://www.youtube.com/watch?v=YjX7fDuSq3Y	ÙƒØªØ§Ø¨ Ø§Ù„Ø¢Ø«Ø§Ø±ØŒ Ø®ÙŠØ± Ø§Ù„Ø£ØµÙˆÙ„ | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨ | 05-06-2026	\N	2026-06-07 17:34:42.63361	2026-06-08 12:31:49.351
48	1khQ5tVYc6YujbXYwXCAWF70gEnnOwLMh	uys-vqbk-mnn (2026-06-08 17:40 GMT+5)	215851570	2026-06-08T16:15:17.431Z	done	3.3 | 08-06-2026 | Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø³ÙˆÙ… | Ù…. Ø§Ø³Ù„Ù… Ø´Ø§Û ØµØ§Ø­Ø¨	Subject: Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø³ÙˆÙ…\nTeacher: Ù…. Ø§Ø³Ù„Ù… Ø´Ø§Û ØµØ§Ø­Ø¨\nDate: 08-06-2026\nSource file: uys-vqbk-mnn (2026-06-08 17:40 GMT+5)\nUploaded automatically by the class recording pipeline.	liC0RFDVPDI	https://www.youtube.com/watch?v=liC0RFDVPDI	3.3 | 08-06-2026 | Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø³ÙˆÙ… | Ù…. Ø§Ø³Ù„Ù… Ø´Ø§Û ØµØ§Ø­Ø¨	\N	2026-06-08 19:16:09.980618	2026-06-10 02:54:08.174
30	1ppwo-fzuXyw3O1RPX9YdmyXZhdM2AxWS	zeo-iaqz-qqu (2026-06-05 17:48 GMT+5)	326121857	2026-06-05T15:57:44.754Z	done	ØªÙˆØ¶ÙŠØ­ Ø§ÙˆÙ„ | Ù…. Ø¹ØªÙŠÙ‚ Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨ | 05-06-2026	Subject: ØªÙˆØ¶ÙŠØ­ Ø§ÙˆÙ„\nTeacher: Ù…. Ø¹ØªÙŠÙ‚ Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨\nDate: 05-06-2026\nSource file: zeo-iaqz-qqu (2026-06-05 17:48 GMT+5)\nUploaded automatically by the class recording pipeline.	-5vfcuMLO2U	https://www.youtube.com/watch?v=-5vfcuMLO2U	ØªÙˆØ¶ÙŠØ­ Ø§ÙˆÙ„ | Ù…. Ø¹ØªÙŠÙ‚ Ø§Ù„Ù„Ù‡ ØµØ§Ø­Ø¨ | 05-06-2026	\N	2026-06-07 17:34:42.636159	2026-06-08 14:19:56.917
46	1DBRMgWA2pCfiRcsptElXzgPA6LIQag3K	uys-vqbk-mnn (2026-06-08 17:40 GMT+5)	106929413	2026-06-08T15:20:12.451Z	done	2.3 | 08-06-2026 | Ø³Ø±Ø§Ø¬Ù‰ | Ù…. Ø®Ø§Ù„Ø¯ Ø²Ù…Ø§Ù† ØµØ§Ø­Ø¨	Subject: Ø³Ø±Ø§Ø¬Ù‰\nTeacher: Ù…. Ø®Ø§Ù„Ø¯ Ø²Ù…Ø§Ù† ØµØ§Ø­Ø¨\nDate: 08-06-2026\nSource file: uys-vqbk-mnn (2026-06-08 17:40 GMT+5)\nUploaded automatically by the class recording pipeline.	WRYqpFHF7P4	https://www.youtube.com/watch?v=WRYqpFHF7P4	2.3 | 08-06-2026 | Ø³Ø±Ø§Ø¬Ù‰ | Ù…. Ø®Ø§Ù„Ø¯ Ø²Ù…Ø§Ù† ØµØ§Ø­Ø¨	\N	2026-06-08 18:21:09.263674	2026-06-10 02:50:38.751
33	1IkRbQ3CFsAxmwdiz4BlbfmKJHIZLEqIk	zeo-iaqz-qqu (2026-06-05 17:48 GMT+5)	103456894	2026-06-05T17:44:01.356Z	done	Ø´Ø±Ø­ Ø¹Ù‚Ø§Ø¦Ø¯ | Ù…. Ø®Ø§Ù„Ø¯ Ø²Ù…Ø§Ù† ØµØ§Ø­Ø¨ | 05-06-2026	Subject: Ø´Ø±Ø­ Ø¹Ù‚Ø§Ø¦Ø¯\nTeacher: Ù…. Ø®Ø§Ù„Ø¯ Ø²Ù…Ø§Ù† ØµØ§Ø­Ø¨\nDate: 05-06-2026\nSource file: zeo-iaqz-qqu (2026-06-05 17:48 GMT+5)\nUploaded automatically by the class recording pipeline.	YMMxM25fu6E	https://www.youtube.com/watch?v=YMMxM25fu6E	Ø´Ø±Ø­ Ø¹Ù‚Ø§Ø¦Ø¯ | Ù…. Ø®Ø§Ù„Ø¯ Ø²Ù…Ø§Ù† ØµØ§Ø­Ø¨ | 05-06-2026	\N	2026-06-07 17:34:42.647331	2026-06-08 15:08:24.207
47	1y__CpPDsTssQ1dEZqR19AYhJn8-stqk4	uys-vqbk-mnn (2026-06-08 17:40 GMT+5)	194711858	2026-06-08T16:03:24.410Z	done	Ø¬Ù„Ø§Ù„ÙŠÙ† Ø¯ÙˆÙ… | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨ | 08-06-2026	Subject: Ø¬Ù„Ø§Ù„ÙŠÙ† Ø¯ÙˆÙ…\nTeacher: Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨\nDate: 08-06-2026\nSource file: uys-vqbk-mnn (2026-06-08 17:40 GMT+5)\nUploaded automatically by the class recording pipeline.	0TKPH7DKSXE	https://www.youtube.com/watch?v=0TKPH7DKSXE	Ø¬Ù„Ø§Ù„ÙŠÙ† Ø¯ÙˆÙ… | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨ | 08-06-2026	\N	2026-06-08 19:04:09.339664	2026-06-10 02:53:00.377
21	1w0YA3aA11VhWRREaZbNBsuJtzV4WRZJU	zeo-iaqz-qqu (2026-05-23 17:44 GMT+5)	91062036	2026-05-23T15:29:15.787Z	done	ÙƒØªØ§Ø¨ Ø§Ù„Ø¢Ø«Ø§Ø±ØŒ Ø®ÙŠØ± Ø§Ù„Ø£ØµÙˆÙ„ | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨ | 23-05-2026	Subject: ÙƒØªØ§Ø¨ Ø§Ù„Ø¢Ø«Ø§Ø±ØŒ Ø®ÙŠØ± Ø§Ù„Ø£ØµÙˆÙ„\nTeacher: Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨\nDate: 23-05-2026\nSource file: zeo-iaqz-qqu (2026-05-23 17:44 GMT+5)\nUploaded automatically by the class recording pipeline.	M7ejn1zCwnw	https://www.youtube.com/watch?v=M7ejn1zCwnw	ÙƒØªØ§Ø¨ Ø§Ù„Ø¢Ø«Ø§Ø±ØŒ Ø®ÙŠØ± Ø§Ù„Ø£ØµÙˆÙ„ | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨ | 23-05-2026	\N	2026-06-07 17:34:42.616981	2026-06-08 14:16:42.365
50	10eUJ2YKUpBvjrMYB2b8krlMOZIsgUPQb	zeo-iaqz-qqu (2026-05-23 17:44 GMT+5)	452292963	2026-05-23T17:38:38.585Z	done	Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø¯ÙˆÙ… | Ù…. Ø³Ø¹ÙŠØ¯ Ø§Ù„Ø±Ø­Ù…Ù† ØµØ§Ø­Ø¨ | 23-05-2026	Subject: Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø¯ÙˆÙ…\nTeacher: Ù…. Ø³Ø¹ÙŠØ¯ Ø§Ù„Ø±Ø­Ù…Ù† ØµØ§Ø­Ø¨\nDate: 23-05-2026\nSource file: zeo-iaqz-qqu (2026-05-23 17:44 GMT+5)\nUploaded automatically by the class recording pipeline.	gUTUp_c4768	https://www.youtube.com/watch?v=gUTUp_c4768	Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø¯ÙˆÙ… | Ù…. Ø³Ø¹ÙŠØ¯ Ø§Ù„Ø±Ø­Ù…Ù† ØµØ§Ø­Ø¨ | 23-05-2026	\N	2026-06-08 21:16:04.042064	2026-06-09 08:13:20.085
51	1xf5n8nUNXPy6YPzEkdyeqn0DApQzfJkS	uys-vqbk-mnn (2026-06-09 17:46 GMT+5)	127812683	2026-06-09T13:49:46.241Z	done	4.2 | 09-06-2026 | ØªÙˆØ¶ÙŠØ­ Ø¯ÙˆÙ… | Ù…. Ø³Ø¹ÙŠØ¯ Ø§Ù„Ø±Ø­Ù…Ù† ØµØ§Ø­Ø¨	Subject: ØªÙˆØ¶ÙŠØ­ Ø¯ÙˆÙ…\nTeacher: Ù…. Ø³Ø¹ÙŠØ¯ Ø§Ù„Ø±Ø­Ù…Ù† ØµØ§Ø­Ø¨\nDate: 09-06-2026\nSource file: uys-vqbk-mnn (2026-06-09 17:46 GMT+5)\nUploaded automatically by the class recording pipeline.	YXIxdjYN7L0	https://www.youtube.com/watch?v=YXIxdjYN7L0	4.2 | 09-06-2026 | ØªÙˆØ¶ÙŠØ­ Ø¯ÙˆÙ… | Ù…. Ø³Ø¹ÙŠØ¯ Ø§Ù„Ø±Ø­Ù…Ù† ØµØ§Ø­Ø¨	\N	2026-06-09 16:58:25.490822	2026-06-10 03:00:42.183
49	1NBuowbdqrrq61FpKBMXvXyCyNxTKIJhy	zeo-iaqz-qqu (2026-06-06 17:51 GMT+5)	85660883	2026-06-06T17:19:50.652Z	done	Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø¯ÙˆÙ… | Ù…. Ø³Ø¹ÙŠØ¯ Ø§Ù„Ø±Ø­Ù…Ù† ØµØ§Ø­Ø¨ | 06-06-2026	Subject: Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø¯ÙˆÙ…\nTeacher: Ù…. Ø³Ø¹ÙŠØ¯ Ø§Ù„Ø±Ø­Ù…Ù† ØµØ§Ø­Ø¨\nDate: 06-06-2026\nSource file: zeo-iaqz-qqu (2026-06-06 17:51 GMT+5)\nUploaded automatically by the class recording pipeline.	1ytaerLa3ao	https://www.youtube.com/watch?v=1ytaerLa3ao	Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø¯ÙˆÙ… | Ù…. Ø³Ø¹ÙŠØ¯ Ø§Ù„Ø±Ø­Ù…Ù† ØµØ§Ø­Ø¨ | 06-06-2026	\N	2026-06-08 21:15:43.494913	2026-06-09 08:09:56.711
44	1q4w6c0NARkbVftfyhx71cfaJ4vUE-SHF	uys-vqbk-mnn (2026-06-08 17:40 GMT+5)	235548760	2026-06-08T14:29:55.088Z	done	1.2 | 08-06-2026 | Ø¬Ù„Ø§Ù„ÙŠÙ† Ø¯ÙˆÙ… | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨	Subject: Ø¬Ù„Ø§Ù„ÙŠÙ† Ø¯ÙˆÙ…\nTeacher: Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨\nDate: 08-06-2026\nSource file: uys-vqbk-mnn (2026-06-08 17:40 GMT+5)\nUploaded automatically by the class recording pipeline.	MrnC57DfLRs	https://www.youtube.com/watch?v=MrnC57DfLRs	1.2 | 08-06-2026 | Ø¬Ù„Ø§Ù„ÙŠÙ† Ø¯ÙˆÙ… | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨	\N	2026-06-08 17:35:33.812122	2026-06-10 02:49:14.511
45	1lT_SsT7thfDUgX4GZs2e7xEaoKdEHI_5	uys-vqbk-mnn (2026-06-08 17:40 GMT+5)	78163767	2026-06-08T14:47:38.871Z	done	6.1 | 08-06-2026 | Ù…ØªÙ† Ø§Ù„ÙƒØ§ÙÙŠØŒ Ø§Ù„Ù‡ÙŠØ¦Ø© Ø§Ù„ØµØºØ±Ù‰ | Ù…. Ø¹Ø§Ù…Ø± Ø§Ù‚Ø¨Ø§Ù„ ØµØ§Ø­Ø¨	Subject: Ù…ØªÙ† Ø§Ù„ÙƒØ§ÙÙŠØŒ Ø§Ù„Ù‡ÙŠØ¦Ø© Ø§Ù„ØµØºØ±Ù‰\nTeacher: Ù…. Ø¹Ø§Ù…Ø± Ø§Ù‚Ø¨Ø§Ù„ ØµØ§Ø­Ø¨\nDate: 08-06-2026\nSource file: uys-vqbk-mnn (2026-06-08 17:40 GMT+5)\nUploaded automatically by the class recording pipeline.	IHua1j_Mp-I	https://www.youtube.com/watch?v=IHua1j_Mp-I	6.1 | 08-06-2026 | Ù…ØªÙ† Ø§Ù„ÙƒØ§ÙÙŠØŒ Ø§Ù„Ù‡ÙŠØ¦Ø© Ø§Ù„ØµØºØ±Ù‰ | Ù…. Ø¹Ø§Ù…Ø± Ø§Ù‚Ø¨Ø§Ù„ ØµØ§Ø­Ø¨	\N	2026-06-08 17:48:00.034419	2026-06-10 02:49:39.049
43	1xlz1iy1hY6Zzy8a8IvGtQTfq6eS3uGhL	uys-vqbk-mnn (2026-06-08 17:40 GMT+5)	246521966	2026-06-08T14:15:37.004Z	done	4.2 | 08-06-2026 | ØªÙˆØ¶ÙŠØ­ Ø¯ÙˆÙ… | Ù…. Ø³Ø¹ÙŠØ¯ Ø§Ù„Ø±Ø­Ù…Ù† ØµØ§Ø­Ø¨	Subject: ØªÙˆØ¶ÙŠØ­ Ø¯ÙˆÙ…\nTeacher: Ù…. Ø³Ø¹ÙŠØ¯ Ø§Ù„Ø±Ø­Ù…Ù† ØµØ§Ø­Ø¨\nDate: 08-06-2026\nSource file: uys-vqbk-mnn (2026-06-08 17:40 GMT+5)\nUploaded automatically by the class recording pipeline.	7PJJk2eB3cc	https://www.youtube.com/watch?v=7PJJk2eB3cc	4.2 | 08-06-2026 | ØªÙˆØ¶ÙŠØ­ Ø¯ÙˆÙ… | Ù…. Ø³Ø¹ÙŠØ¯ Ø§Ù„Ø±Ø­Ù…Ù† ØµØ§Ø­Ø¨	\N	2026-06-08 17:16:19.789433	2026-06-10 02:48:13.266
55	1Qpinu1B7UFrESf0UPhSaGSokt7nTw75b	uys-vqbk-mnn (2026-06-09 17:46 GMT+5)	195876440	2026-06-09T16:12:16.374Z	done	1.2 | Ø¬Ù„Ø§Ù„ÙŠÙ† Ø¯ÙˆÙ… | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨ | 09-06-2026 | Part 2	Subject: 1.2\nTeacher: Ø¬Ù„Ø§Ù„ÙŠÙ† Ø¯ÙˆÙ…\nDate: 09-06-2026\nSource file: uys-vqbk-mnn (2026-06-09 17:46 GMT+5)\nUploaded automatically by the class recording pipeline.	V0b7bql3Yl0	https://www.youtube.com/watch?v=V0b7bql3Yl0	1.2 | Ø¬Ù„Ø§Ù„ÙŠÙ† Ø¯ÙˆÙ… | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨ | 09-06-2026 | Part 2	\N	2026-06-09 20:44:02.826629	2026-06-10 03:16:57.876
91	1Duzwgul6ih7XUGlm5In6Un5_5KoCWul2	zeo-iaqz-qqu (2026-06-12 17:48 GMT+5)	184207870	2026-06-12T16:33:55.536Z	done	3.2 Hidaya Sani Part 2 | Ustad Saeedur Rahman | 12-06-2026	Subject: Hidaya Sani Part 2\nTeacher: Ustad Saeedur Rahman\nDate: 12-06-2026\nSource file: zeo-iaqz-qqu (2026-06-12 17:48 GMT+5)\nUploaded automatically by the class recording pipeline.	3WFJbXL6I34	https://www.youtube.com/watch?v=3WFJbXL6I34	3.2 Hidaya Sani Part 2 | Ustad Saeedur Rahman | 12-06-2026	\N	2026-06-16 19:54:58.789487	2026-06-16 17:20:37.632
53	14Edl6UHe9gN35PEoylJeMdDSR3jIvJcC	uys-vqbk-mnn (2026-06-09 17:46 GMT+5)	9389626	2026-06-09T14:44:02.645Z	done	2.3 | Ø³Ø±Ø§Ø¬Ù‰ | Ù…. Ø®Ø§Ù„Ø¯ Ø²Ù…Ø§Ù† ØµØ§Ø­Ø¨ | 09-06-2026	Subject: 2.3\nTeacher: Ø³Ø±Ø§Ø¬Ù‰\nDate: 09-06-2026\nSource file: uys-vqbk-mnn (2026-06-09 17:46 GMT+5)\nUploaded automatically by the class recording pipeline.	UF0vqJ27TTg	https://www.youtube.com/watch?v=UF0vqJ27TTg	2.3 | Ø³Ø±Ø§Ø¬Ù‰ | Ù…. Ø®Ø§Ù„Ø¯ Ø²Ù…Ø§Ù† ØµØ§Ø­Ø¨ | 09-06-2026	\N	2026-06-09 20:44:02.796462	2026-06-10 03:14:16.025
56	1iOoR5gmEumJkCKmZpNkb5hgUCLY4A596	uys-vqbk-mnn (2026-06-09 17:46 GMT+5)	294335156	2026-06-09T16:48:58.746Z	done	3.3 | 09-06-2026 | Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø³ÙˆÙ… | Ù…. Ø§Ø³Ù„Ù… Ø´Ø§Û ØµØ§Ø­Ø¨	Subject: Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø³ÙˆÙ…\nTeacher: Ù…. Ø§Ø³Ù„Ù… Ø´Ø§Û ØµØ§Ø­Ø¨\nDate: 09-06-2026\nSource file: uys-vqbk-mnn (2026-06-09 17:46 GMT+5)\nUploaded automatically by the class recording pipeline.	8u2xzOlKNrw	https://www.youtube.com/watch?v=8u2xzOlKNrw	3.3 | 09-06-2026 | Ù‡Ø¯Ø§ÙŠØ© Ø«Ø§Ù†ÙŠ Ø­ØµÛ Ø³ÙˆÙ… | Ù…. Ø§Ø³Ù„Ù… Ø´Ø§Û ØµØ§Ø­Ø¨	\N	2026-06-09 20:44:02.828979	2026-06-10 03:18:22.34
52	19Dok7f_PtsB1ZGQvX1acPINP6TNIGHBn	uys-vqbk-mnn (2026-06-09 17:46 GMT+5)	13913505	2026-06-09T14:07:40.956Z	done	6.1 | 09-06-2026 | Ù…ØªÙ† Ø§Ù„ÙƒØ§ÙÙŠØŒ Ø§Ù„Ù‡ÙŠØ¦Ø© Ø§Ù„ØµØºØ±Ù‰ | Ù…. Ø¹Ø§Ù…Ø± Ø§Ù‚Ø¨Ø§Ù„ ØµØ§Ø­Ø¨	Subject: Ù…ØªÙ† Ø§Ù„ÙƒØ§ÙÙŠØŒ Ø§Ù„Ù‡ÙŠØ¦Ø© Ø§Ù„ØµØºØ±Ù‰\nTeacher: Ù…. Ø¹Ø§Ù…Ø± Ø§Ù‚Ø¨Ø§Ù„ ØµØ§Ø­Ø¨\nDate: 09-06-2026\nSource file: uys-vqbk-mnn (2026-06-09 17:46 GMT+5)\nUploaded automatically by the class recording pipeline.	xM_4QZ9rLKM	https://www.youtube.com/watch?v=xM_4QZ9rLKM	6.1 | 09-06-2026 | Ù…ØªÙ† Ø§Ù„ÙƒØ§ÙÙŠØŒ Ø§Ù„Ù‡ÙŠØ¦Ø© Ø§Ù„ØµØºØ±Ù‰ | Ù…. Ø¹Ø§Ù…Ø± Ø§Ù‚Ø¨Ø§Ù„ ØµØ§Ø­Ø¨	\N	2026-06-09 17:08:24.494417	2026-06-10 03:01:13.031
54	1U731gAqFXAZoQps5TFgZ11wNw6PpXYok	uys-vqbk-mnn (2026-06-09 17:46 GMT+5)	139711943	2026-06-09T15:07:03.659Z	done	1.2 | Ø¬Ù„Ø§Ù„ÙŠÙ† Ø¯ÙˆÙ… | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨ | 09-06-2026 | Part 1	Subject: 1.2\nTeacher: Ø¬Ù„Ø§Ù„ÙŠÙ† Ø¯ÙˆÙ…\nDate: 09-06-2026\nSource file: uys-vqbk-mnn (2026-06-09 17:46 GMT+5)\nUploaded automatically by the class recording pipeline.	l97c0YbeOo0	https://www.youtube.com/watch?v=l97c0YbeOo0	1.2 | Ø¬Ù„Ø§Ù„ÙŠÙ† Ø¯ÙˆÙ… | Ù…. Ø­Ø³ÙŠØ¨ ØµØ§Ø­Ø¨ | 09-06-2026 | Part 1	\N	2026-06-09 20:44:02.824341	2026-06-10 03:15:45.988
94	1KZ2dRQskCk__avBpZyGM7lTSQS1-3yq8	zeo-iaqz-qqu (2026-06-13 17:51 GMT+5)	109446066	2026-06-13T13:52:10.903Z	done	1.1 Jalalain Part 1 | Ustad Fayyaz | 13-06-2026	Subject: Jalalain Part 1\nTeacher: Ustad Fayyaz\nDate: 13-06-2026\nSource file: zeo-iaqz-qqu (2026-06-13 17:51 GMT+5)\nUploaded automatically by the class recording pipeline.	u8Bg6w-zavQ	https://www.youtube.com/watch?v=u8Bg6w-zavQ	1.1 Jalalain Part 1 | Ustad Fayyaz | 13-06-2026	\N	2026-06-16 19:54:58.797155	2026-06-16 19:09:06.388
93	1h26AxrAxovwd9AAXbEb0Tw4bl2GMWyhX	zeo-iaqz-qqu (2026-06-12 17:48 GMT+5)	77926040	2026-06-12T17:13:13.196Z	done	5.1 Sharah Aqaid | Ustad Khalid Zaman | 12-06-2026	Subject: Sharah Aqaid\nTeacher: Ustad Khalid Zaman\nDate: 12-06-2026\nSource file: zeo-iaqz-qqu (2026-06-12 17:48 GMT+5)\nUploaded automatically by the class recording pipeline.	9BHXFJKHdiQ	https://www.youtube.com/watch?v=9BHXFJKHdiQ	5.1 Sharah Aqaid | Ustad Khalid Zaman | 12-06-2026	\N	2026-06-16 19:54:58.795002	2026-06-16 17:18:22.633
87	1FvN6fWYZ8CdgOP9wtrrXVcPSJ6j0_ES2	zeo-iaqz-qqu (2026-06-12 17:48 GMT+5)	84082629	2026-06-12T14:50:53.789Z	done	2.2 Kitab ul Asar | Ustad Haseeb | 12-06-2026	Subject: Kitab ul Asar\nTeacher: Ustad Haseeb\nDate: 12-06-2026\nSource file: zeo-iaqz-qqu (2026-06-12 17:48 GMT+5)\nUploaded automatically by the class recording pipeline.	Dc22n5KUz-I	https://www.youtube.com/watch?v=Dc22n5KUz-I	2.2 Kitab ul Asar | Ustad Haseeb | 12-06-2026	\N	2026-06-16 19:54:58.78438	2026-06-16 17:11:52.599
90	1qCP64BWJ6Yhz8LfdBD1VzQlQCnT-zm0y	zeo-iaqz-qqu (2026-06-12 17:48 GMT+5)	250569411	2026-06-12T16:18:45.321Z	done	4.1 Tawzeeh Part 1 | Ustad Atiqullah | 12-06-2026 | Part 1	Subject: 4.1 Tawzeeh Part 1\nTeacher: Ustad Atiqullah\nDate: 12-06-2026\nSource file: zeo-iaqz-qqu (2026-06-12 17:48 GMT+5)\nUploaded automatically by the class recording pipeline.	DQ2J3blmlE8	https://www.youtube.com/watch?v=DQ2J3blmlE8	4.1 Tawzeeh Part 1 | Ustad Atiqullah | 12-06-2026 | Part 1	\N	2026-06-16 19:54:58.788314	2026-06-16 17:20:53.85
92	17j3D8HNIHspg8e7hMf7xoYRtlo0Rvwg0	zeo-iaqz-qqu (2026-06-12 17:48 GMT+5)	63215352	2026-06-12T16:42:52.112Z	done	6.2 Dewan Hamasa | Ustad Faraz | 12-06-2026	Subject: Dewan Hamasa\nTeacher: Ustad Faraz\nDate: 12-06-2026\nSource file: zeo-iaqz-qqu (2026-06-12 17:48 GMT+5)\nUploaded automatically by the class recording pipeline.	dTmKl3bw7AI	https://www.youtube.com/watch?v=dTmKl3bw7AI	6.2 Dewan Hamasa | Ustad Faraz | 12-06-2026	\N	2026-06-16 19:54:58.790653	2026-06-16 17:17:02.044
88	1fy8SVRu9S4f5ai-2jduMNbJszi20MkEe	zeo-iaqz-qqu (2026-06-12 17:48 GMT+5)	89312279	2026-06-12T15:16:58.971Z	done	1.3 Jalalain Part 3 | Ustad Wasimullah | 12-06-2026 | Part 1	Subject: 1.3 Jalalain Part 3\nTeacher: Ustad Wasimullah\nDate: 12-06-2026\nSource file: zeo-iaqz-qqu (2026-06-12 17:48 GMT+5)\nUploaded automatically by the class recording pipeline.	4W6eIlVNNKc	https://www.youtube.com/watch?v=4W6eIlVNNKc	1.3 Jalalain Part 3 | Ustad Wasimullah | 12-06-2026 | Part 1	\N	2026-06-16 19:54:58.785844	2026-06-16 17:13:58.835
86	1OmC3vtmB1y7jDHk3qqKm6xY0U4DSI86o	zeo-iaqz-qqu (2026-06-12 17:48 GMT+5)	147070887	2026-06-12T14:34:37.078Z	done	1.1 Jalalain Part 1 | Ustad Fayyaz | 12-06-2026 | Part 1	Subject: 1.1 Jalalain Part 1\nTeacher: Ustad Fayyaz\nDate: 12-06-2026\nSource file: zeo-iaqz-qqu (2026-06-12 17:48 GMT+5)\nUploaded automatically by the class recording pipeline.	KT8k-FmtvE0	https://www.youtube.com/watch?v=KT8k-FmtvE0	1.1 Jalalain Part 1 | Ustad Fayyaz | 12-06-2026 | Part 1	\N	2026-06-16 19:54:58.74958	2026-06-16 17:11:27.536
104	1NKFAY7GjKQHTlVog-4Q4HDAk4EOV5ecH	uys-vqbk-mnn (2026-06-15 17:42 GMT+5)	45094446	2026-06-15T14:28:29.483Z	needs_review	6.1 Matan ul Kafi | Ustad Aamir Iqbal | 15-06-2026	Subject: Matan ul Kafi\nTeacher: Ustad Aamir Iqbal\nDate: 15-06-2026\nSource file: uys-vqbk-mnn (2026-06-15 17:42 GMT+5)\nUploaded automatically by the class recording pipeline.	\N	\N	\N	\N	2026-06-16 19:54:58.812442	2026-06-23 15:31:30.688
103	1mx276fKERB_wJUlHLELcYC5__rADXxgL	uys-vqbk-mnn (2026-06-15 17:42 GMT+5)	227386709	2026-06-15T14:26:27.073Z	needs_review	1.2 Jalalain Part 2 | Ustad Haseeb | 15-06-2026	Subject: Jalalain Part 2\nTeacher: Ustad Haseeb\nDate: 15-06-2026\nSource file: uys-vqbk-mnn (2026-06-15 17:42 GMT+5)\nUploaded automatically by the class recording pipeline.	\N	\N	\N	\N	2026-06-16 19:54:58.810308	2026-06-23 15:31:30.691
105	1f9pvxuCWx9Aub1OExPa-RerUmopVpJPA	uys-vqbk-mnn (2026-06-15 17:42 GMT+5)	162364254	2026-06-15T15:52:05.871Z	needs_review	2.3 Siraji | Ustad Khalid Zaman | 15-06-2026	Subject: Siraji\nTeacher: Ustad Khalid Zaman\nDate: 15-06-2026\nSource file: uys-vqbk-mnn (2026-06-15 17:42 GMT+5)\nUploaded automatically by the class recording pipeline.	\N	\N	\N	\N	2026-06-16 19:54:58.814228	2026-06-23 15:31:30.696
106	1qDfwMLS79hrPUig8G2IoplC7vyZ95OAQ	uys-vqbk-mnn (2026-06-15 17:42 GMT+5)	304220801	2026-06-15T16:29:39.184Z	needs_review	2.1 Al Fawz ul Kabir | Ustad Haseeb | 15-06-2026	Subject: Al Fawz ul Kabir\nTeacher: Ustad Haseeb\nDate: 15-06-2026\nSource file: uys-vqbk-mnn (2026-06-15 17:42 GMT+5)\nUploaded automatically by the class recording pipeline.	\N	\N	\N	\N	2026-06-16 19:54:58.815479	2026-06-23 15:31:30.699
107	1MlEd20iSz8QsoR7GWAULufzOaJMrFojJ	uys-vqbk-mnn (2026-06-16 17:48 GMT+5)	220343305	2026-06-16T13:57:41.159Z	needs_review	4.2 Tawzeeh Part 2 | Ustad Saeedur Rahman | 16-06-2026	Subject: Tawzeeh Part 2\nTeacher: Ustad Saeedur Rahman\nDate: 16-06-2026\nSource file: uys-vqbk-mnn (2026-06-16 17:48 GMT+5)\nUploaded automatically by the class recording pipeline.	\N	\N	\N	\N	2026-06-16 19:54:58.816508	2026-06-23 15:31:30.702
108	1uMjYRXNbzB7EfxVek0ooowkEjCwgpBte	uys-vqbk-mnn (2026-06-16 17:48 GMT+5)	250376500	2026-06-16T15:10:36.626Z	needs_review	6.1 Matan ul Kafi | Ustad Aamir Iqbal | 16-06-2026	Subject: Matan ul Kafi\nTeacher: Ustad Aamir Iqbal\nDate: 16-06-2026\nSource file: uys-vqbk-mnn (2026-06-16 17:48 GMT+5)\nUploaded automatically by the class recording pipeline.	\N	\N	\N	\N	2026-06-16 19:54:58.817757	2026-06-23 15:31:30.704
109	1oaI7jzNQOIW0X6Gckdknam83Bfudm4cr	uys-vqbk-mnn (2026-06-16 17:48 GMT+5)	164357471	2026-06-16T15:57:43.182Z	needs_review	1.2 Jalalain Part 2 | Ustad Haseeb | 16-06-2026	Subject: Jalalain Part 2\nTeacher: Ustad Haseeb\nDate: 16-06-2026\nSource file: uys-vqbk-mnn (2026-06-16 17:48 GMT+5)\nUploaded automatically by the class recording pipeline.	\N	\N	\N	\N	2026-06-16 19:54:58.818698	2026-06-23 15:31:30.708
110	1WCL0elXMxrVh9je__788vBOx1cIoIScF	uys-vqbk-mnn (2026-06-16 17:48 GMT+5)	161285488	2026-06-16T16:18:40.678Z	needs_review	5.2 Falakiyat | Ustad Khalid Zaman | 16-06-2026	Subject: Falakiyat\nTeacher: Ustad Khalid Zaman\nDate: 16-06-2026\nSource file: uys-vqbk-mnn (2026-06-16 17:48 GMT+5)\nUploaded automatically by the class recording pipeline.	\N	\N	\N	\N	2026-06-16 19:54:58.819875	2026-06-23 15:31:30.71
102	1VsdOEgedRYyrHSjxWy7fbdSdobcevfxr	uys-vqbk-mnn (2026-06-15 17:42 GMT+5)	156989128	2026-06-15T14:15:47.429Z	needs_review	4.2 Tawzeeh Part 2 | Ustad Saeedur Rahman | 15-06-2026	Subject: Tawzeeh Part 2\nTeacher: Ustad Saeedur Rahman\nDate: 15-06-2026\nSource file: uys-vqbk-mnn (2026-06-15 17:42 GMT+5)\nUploaded automatically by the class recording pipeline.	\N	\N	\N	\N	2026-06-16 19:54:58.806557	2026-06-23 15:31:30.678
111	1irh97fM64ouB8SYDQ7-xEMrqVa2-RIOz	zeo-iaqz-qqu (2026-06-19 17:54 GMT+5)	98186639	2026-06-19T14:32:36.370Z	needs_review	3.1 Hidaya Sani Part 1 | Ustad Sirajul Haq | 19-06-2026	Subject: Hidaya Sani Part 1\nTeacher: Ustad Sirajul Haq\nDate: 19-06-2026\nSource file: zeo-iaqz-qqu (2026-06-19 17:54 GMT+5)\nUploaded automatically by the class recording pipeline.	\N	\N	\N	\N	2026-06-21 17:06:46.833782	2026-06-23 15:31:30.713
89	1V57qCoSCZCEyppNs63tZvJ5C0oePoy9v	zeo-iaqz-qqu (2026-06-12 17:48 GMT+5)	109093173	2026-06-12T15:46:42.150Z	done	3.1 Hidaya Sani Part 1 | Ustad Sirajul Haq | 12-06-2026	Subject: 3.1 Hidaya Sani Part 1\nTeacher: Ustad Sirajul Haq\nDate: 12-06-2026\nSource file: zeo-iaqz-qqu (2026-06-12 17:48 GMT+5)\nUploaded automatically by the class recording pipeline.	7X4p5OSRIrc	https://www.youtube.com/watch?v=7X4p5OSRIrc	3.1 Hidaya Sani Part 1 | Ustad Sirajul Haq | 12-06-2026	\N	2026-06-16 19:54:58.787038	2026-06-16 18:01:42.533
100	1zc5FZ9P-lR8F0n_wXfGSIn0grh6WyM9c	zeo-iaqz-qqu (2026-06-13 17:51 GMT+5)	115639022	2026-06-13T16:40:23.344Z	done	6.2 Dewan Hamasa | Ustad Faraz | 13-06-2026	Subject: Dewan Hamasa\nTeacher: Ustad Faraz\nDate: 13-06-2026\nSource file: zeo-iaqz-qqu (2026-06-13 17:51 GMT+5)\nUploaded automatically by the class recording pipeline.	wvsjdntQW5s	https://www.youtube.com/watch?v=wvsjdntQW5s	6.2 Dewan Hamasa | Ustad Faraz | 13-06-2026	\N	2026-06-16 19:54:58.804505	2026-06-16 19:17:32.495
112	1q_-E8O2u1xbON7dokfxxgs5KxNOBf5MU	zeo-iaqz-qqu (2026-06-19 17:54 GMT+5)	44630131	2026-06-19T14:47:15.351Z	needs_review	1.1 Jalalain Part 1 | Ustad Fayyaz | 19-06-2026	Subject: Jalalain Part 1\nTeacher: Ustad Fayyaz\nDate: 19-06-2026\nSource file: zeo-iaqz-qqu (2026-06-19 17:54 GMT+5)\nUploaded automatically by the class recording pipeline.	\N	\N	\N	\N	2026-06-21 17:06:46.963207	2026-06-23 15:31:30.712
\.


--
-- Data for Name: lecture_names; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.lecture_names (id, name, created_at) FROM stdin;
3	1.1 Jalalain Part 1 | Ustad Fayyaz	2026-06-08 11:02:23.989906
11	1.2 Jalalain Part 2 | Ustad Haseeb	2026-06-08 11:02:24.070587
5	1.3 Jalalain Part 3 | Ustad Wasimullah	2026-06-08 11:02:24.010246
14	2.1 Al Fawz ul Kabir | Ustad Haseeb	2026-06-08 11:02:24.09346
4	2.2 Kitab ul Asar | Ustad Haseeb	2026-06-08 11:02:24.001046
13	2.3 Siraji | Ustad Khalid Zaman	2026-06-08 11:02:24.086161
2	3.1 Hidaya Sani Part 1 | Ustad Sirajul Haq	2026-06-08 11:02:23.946907
7	3.2 Hidaya Sani Part 2 | Ustad Saeedur Rahman	2026-06-08 11:02:24.033447
15	3.3 Hidaya Sani Part 3 | Ustad Aslam Shah	2026-06-08 11:02:24.100964
6	4.1 Tawzeeh Part 1 | Ustad Atiqullah	2026-06-08 11:02:24.021894
10	4.2 Tawzeeh Part 2 | Ustad Saeedur Rahman	2026-06-08 11:02:24.058705
9	5.1 Sharah Aqaid | Ustad Khalid Zaman	2026-06-08 11:02:24.050801
16	5.2 Falakiyat | Ustad Khalid Zaman	2026-06-08 11:02:24.106879
12	6.1 Matan ul Kafi | Ustad Aamir Iqbal	2026-06-08 11:02:24.079391
8	6.2 Dewan Hamasa | Ustad Faraz	2026-06-08 11:02:24.04089
\.


--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.settings (id, drive_folder_id, drive_folder_name, youtube_playlist_id, youtube_playlist_name, auto_sync, sync_interval_minutes, updated_at) FROM stdin;
1	12B97Z3wKQwOVFvQ1zvabNx-HNVWk5Ydu	\N	PL6DTkmzRqnL6J6ShD6vzOdAKmxpBIKN4I	Sadisa Section B/H Lectures	t	60	2026-06-16 19:05:07.435
\.


--
-- Name: jobs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.jobs_id_seq', 112, true);


--
-- Name: lecture_names_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.lecture_names_id_seq', 16, true);


--
-- Name: settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.settings_id_seq', 1, true);


--
-- Name: jobs jobs_drive_file_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_drive_file_id_unique UNIQUE (drive_file_id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: lecture_names lecture_names_name_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lecture_names
    ADD CONSTRAINT lecture_names_name_unique UNIQUE (name);


--
-- Name: lecture_names lecture_names_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lecture_names
    ADD CONSTRAINT lecture_names_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- PostgreSQL database dump complete
--
