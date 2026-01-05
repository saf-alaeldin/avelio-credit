--
-- PostgreSQL database dump
--

\restrict FGWninHoOWWevNgEd54xY0qCyvrN8fWnbq3dqHCvCKBZQ6WMcsxpaDh5aJuEi8Z

-- Dumped from database version 15.15
-- Dumped by pg_dump version 15.15

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

--
-- Name: calculate_agent_variance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_agent_variance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.declared_cash IS NOT NULL THEN
    NEW.variance := NEW.declared_cash - NEW.expected_cash;
    IF NEW.variance = 0 THEN
      NEW.variance_status := 'BALANCED';
    ELSIF NEW.variance < 0 THEN
      NEW.variance_status := 'SHORT';
    ELSE
      NEW.variance_status := 'EXTRA';
    END IF;
  ELSE
    NEW.variance := NULL;
    NEW.variance_status := 'PENDING';
  END IF;
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;


--
-- Name: check_settlement_overlap(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_settlement_overlap() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM settlements
    WHERE station_id = NEW.station_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND status NOT IN ('REJECTED')
      AND (
        (NEW.period_from, NEW.period_to) OVERLAPS (period_from, period_to)
      )
  ) THEN
    RAISE EXCEPTION 'Settlement period overlaps with an existing settlement for this station';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: generate_settlement_number(character varying, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_settlement_number(p_station_code character varying, p_date date) RETURNS character varying
    LANGUAGE plpgsql
    AS $_$
DECLARE
  v_date_str VARCHAR;
  v_seq INT;
  v_number VARCHAR;
BEGIN
  v_date_str := TO_CHAR(p_date, 'YYYYMMDD');

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(settlement_number FROM '([0-9]+)$') AS INT)
  ), 0) + 1
  INTO v_seq
  FROM settlements
  WHERE settlement_number LIKE 'STL-' || p_station_code || '-' || v_date_str || '-%';

  v_number := 'STL-' || p_station_code || '-' || v_date_str || '-' || LPAD(v_seq::TEXT, 3, '0');
  RETURN v_number;
END;
$_$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id character varying(50) NOT NULL,
    agency_name character varying(255) NOT NULL,
    contact_phone character varying(20),
    contact_email character varying(255),
    address text,
    city character varying(100),
    country character varying(100),
    credit_limit numeric(15,2) DEFAULT 0,
    outstanding_balance numeric(15,2) DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    receipt_id uuid,
    action character varying(50) NOT NULL,
    old_value jsonb,
    new_value jsonb,
    ip_address character varying(50),
    user_agent text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: expense_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    category character varying(100),
    currencies_allowed text[] DEFAULT ARRAY['USD'::text, 'SSP'::text],
    requires_receipt boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE expense_codes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.expense_codes IS 'Centrally controlled expense codes for settlement expenses';


--
-- Name: offline_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offline_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action_type character varying(50) NOT NULL,
    payload jsonb NOT NULL,
    retry_count integer DEFAULT 0,
    is_synced boolean DEFAULT false,
    error_message text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    synced_at timestamp without time zone
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    receipt_id uuid NOT NULL,
    payment_number character varying(50) NOT NULL,
    amount numeric(10,2) NOT NULL,
    payment_date date NOT NULL,
    payment_time time without time zone DEFAULT CURRENT_TIME,
    payment_method character varying(50) DEFAULT 'CASH'::character varying,
    remarks text,
    created_by uuid,
    created_by_name character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT positive_payment_amount CHECK ((amount > (0)::numeric))
);


--
-- Name: TABLE payments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payments IS 'Tracks individual payment transactions for receipts';


--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    receipt_number character varying(100) NOT NULL,
    agency_id uuid,
    user_id uuid,
    amount numeric(15,2) NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying,
    payment_method character varying(50) DEFAULT 'CASH'::character varying,
    status character varying(20) NOT NULL,
    issue_date date NOT NULL,
    issue_time time without time zone NOT NULL,
    payment_date timestamp without time zone,
    due_date date,
    station_code character varying(3) NOT NULL,
    issued_by_name character varying(255),
    purpose text DEFAULT 'Agency Credit Account Deposit'::text,
    remarks text,
    transaction_ref character varying(100),
    document_hash character varying(255),
    is_synced boolean DEFAULT false,
    is_void boolean DEFAULT false,
    void_reason text,
    void_date timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    amount_paid numeric(10,2) DEFAULT 0,
    amount_remaining numeric(10,2)
);


--
-- Name: COLUMN receipts.amount_paid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.receipts.amount_paid IS 'Total amount paid so far (sum of all payments)';


--
-- Name: COLUMN receipts.amount_remaining; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.receipts.amount_remaining IS 'Remaining amount to be paid (amount - amount_paid)';


--
-- Name: sales_agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_code character varying(50) NOT NULL,
    agent_name character varying(255) NOT NULL,
    station_id uuid,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE sales_agents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sales_agents IS 'Sales agents who handle cash transactions at stations';


--
-- Name: settlement_agent_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settlement_agent_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    settlement_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    currency character varying(10) NOT NULL,
    expected_cash numeric(15,2) DEFAULT 0 NOT NULL,
    declared_cash numeric(15,2),
    variance numeric(15,2),
    variance_status character varying(20),
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_variance_status CHECK (((variance_status IS NULL) OR ((variance_status)::text = ANY ((ARRAY['BALANCED'::character varying, 'SHORT'::character varying, 'EXTRA'::character varying, 'PENDING'::character varying])::text[]))))
);


--
-- Name: TABLE settlement_agent_entries; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.settlement_agent_entries IS 'Per-agent expected vs declared cash for settlements';


--
-- Name: COLUMN settlement_agent_entries.expected_cash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.settlement_agent_entries.expected_cash IS 'System-calculated sum of agent sales';


--
-- Name: COLUMN settlement_agent_entries.declared_cash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.settlement_agent_entries.declared_cash IS 'HQ-declared cash amount sent by agent';


--
-- Name: COLUMN settlement_agent_entries.variance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.settlement_agent_entries.variance IS 'declared_cash - expected_cash';


--
-- Name: settlement_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settlement_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    settlement_id uuid,
    user_id uuid,
    action character varying(50) NOT NULL,
    field_changed character varying(100),
    old_value jsonb,
    new_value jsonb,
    notes text,
    ip_address character varying(50),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE settlement_audit_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.settlement_audit_logs IS 'Detailed audit trail for all settlement actions';


--
-- Name: COLUMN settlement_audit_logs.action; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.settlement_audit_logs.action IS 'CREATE, UPDATE, SUBMIT, APPROVE, REJECT, ADD_EXPENSE, etc.';


--
-- Name: settlement_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settlement_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    settlement_id uuid NOT NULL,
    expense_code_id uuid NOT NULL,
    currency character varying(10) NOT NULL,
    amount numeric(15,2) NOT NULL,
    description text,
    created_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE settlement_expenses; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.settlement_expenses IS 'Expenses that reduce cash holding for a settlement';


--
-- Name: settlement_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settlement_summaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    settlement_id uuid NOT NULL,
    currency character varying(10) NOT NULL,
    opening_balance numeric(15,2) DEFAULT 0,
    opening_balance_settlement_id uuid,
    expected_cash numeric(15,2) DEFAULT 0 NOT NULL,
    total_expenses numeric(15,2) DEFAULT 0,
    expected_net_cash numeric(15,2) DEFAULT 0 NOT NULL,
    actual_cash_received numeric(15,2),
    final_variance numeric(15,2),
    variance_status character varying(20),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_summary_variance_status CHECK (((variance_status IS NULL) OR ((variance_status)::text = ANY ((ARRAY['BALANCED'::character varying, 'SHORT'::character varying, 'EXTRA'::character varying, 'PENDING'::character varying])::text[]))))
);


--
-- Name: TABLE settlement_summaries; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.settlement_summaries IS 'Per-currency summary for settlements with carry-forward';


--
-- Name: COLUMN settlement_summaries.opening_balance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.settlement_summaries.opening_balance IS 'Carry-forward variance from previous settlement';


--
-- Name: COLUMN settlement_summaries.expected_net_cash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.settlement_summaries.expected_net_cash IS 'expected_cash - total_expenses + opening_balance';


--
-- Name: COLUMN settlement_summaries.final_variance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.settlement_summaries.final_variance IS 'actual_cash_received - expected_net_cash';


--
-- Name: settlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settlements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    settlement_number character varying(50) NOT NULL,
    station_id uuid NOT NULL,
    period_from date NOT NULL,
    period_to date NOT NULL,
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    created_by uuid,
    submitted_by uuid,
    submitted_at timestamp without time zone,
    reviewed_by uuid,
    reviewed_at timestamp without time zone,
    approval_type character varying(50),
    approval_notes text,
    rejection_reason text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_status CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'REVIEW'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying, 'CLOSED'::character varying])::text[])))
);


--
-- Name: TABLE settlements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.settlements IS 'Main settlement records for station cash reconciliation';


--
-- Name: COLUMN settlements.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.settlements.status IS 'DRAFT, REVIEW, APPROVED, REJECTED, CLOSED';


--
-- Name: COLUMN settlements.approval_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.settlements.approval_type IS 'BALANCED or APPROVED_WITH_VARIANCE';


--
-- Name: station_sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.station_sales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_reference character varying(100) NOT NULL,
    station_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    transaction_date date NOT NULL,
    transaction_time time without time zone,
    flight_reference character varying(50),
    amount numeric(15,2) NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying NOT NULL,
    payment_method character varying(50) DEFAULT 'CASH'::character varying,
    customer_name character varying(255),
    description text,
    settlement_id uuid,
    created_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE station_sales; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.station_sales IS 'Sales transactions from reservation system or manual entry';


--
-- Name: COLUMN station_sales.settlement_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.station_sales.settlement_id IS 'NULL until sale is included in a settlement';


--
-- Name: stations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_code character varying(10) NOT NULL,
    station_name character varying(255) NOT NULL,
    currencies_allowed text[] DEFAULT ARRAY['USD'::text, 'SSP'::text],
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE stations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.stations IS 'Master data for airline stations/POS locations';


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    employee_id character varying(50),
    station_code character varying(3) NOT NULL,
    role character varying(50) NOT NULL,
    phone character varying(20),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    username character varying(100)
);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Data for Name: agencies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.agencies (id, agency_id, agency_name, contact_phone, contact_email, address, city, country, credit_limit, outstanding_balance, is_active, created_at, updated_at) FROM stdin;
f103c84f-b37c-4a9e-9153-86c5390e52f8	10003829	IMPERIAL TRAVEL	\N	IMPERIALTRAVEL18@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.35734	2025-11-13 15:07:26.35734
da0df161-00ff-4e4c-8143-85efbdcf9a6c	10060826	HUMICO COMPANY	\N	HUMICOCOMPANY@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.359749	2025-11-13 15:07:26.359749
c172adc1-51a7-4b98-ac66-6be0ca8ad76c	10036104	EXPLORE TRAVELS	\N	INFO@EXPLORETRAVELS.COM.SS	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.360374	2025-11-13 15:07:26.360374
dcf75744-d73c-42a3-834e-26403c61d617	10003941	AGOR & SONS FOR TRADE	\N	HASANATAGOR57@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.360629	2025-11-13 15:07:26.360629
2b65b44a-14cc-4e5c-a66d-b4fabb956880	10005557	LEKKI FOR TRADING	\N	INFO.LEKKITRAVELAGENCY@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.360952	2025-11-13 15:07:26.360952
326d8d10-b140-477a-825d-81700eda0b7a	10002607	KARMELA TRAVEL	\N	INFO.MASUETOUCINCOLTD@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.361545	2025-11-13 15:07:26.361545
3d8235ef-e3f4-49f4-999d-0572a0bf346e	10000097	HOLIDAY DREAMZ TRAVEL	\N	HOLIDAYDREAMZ@YAHOO.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.362061	2025-11-13 15:07:26.362061
13192c0e-3fdd-40bd-bc20-6a80f8d61d79	10007143	HALLMARK TRAVEL	\N	HALLMARK-JUBA@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.362643	2025-11-13 15:07:26.362643
708a26e8-9c03-409c-8bb8-1bdc645523bb	10003907	ALRITAJ TRAVEL	\N	a@a.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.364022	2025-11-13 15:07:26.364022
371e1192-1a73-452f-a02c-af60b7a8c55c	10063311	SOLVEN HANDLING	\N	INFO@SOLVENHANDLING.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.366109	2025-11-13 15:07:26.366109
76b5dc78-8304-4b90-a170-915611bb228a	10084532	ABU NEBAL TRAVEL	\N	abunabalo@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.366562	2025-11-13 15:07:26.366562
0e67cf8e-1d6c-497f-a5a5-ded5461a911b	10022792	Jessica Travel Agency	\N	jessicatravel2024@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.367069	2025-11-13 15:07:26.367069
e2061253-d918-4812-a354-ff55159c8bdb	10053683	ADONAI MERCY	\N	ADONAIMERCY007@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.367523	2025-11-13 15:07:26.367523
2b89c467-e4b0-419f-9ade-f42a777264db	10040532	ADAR YEL	\N	ADARYELCO2022@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.367965	2025-11-13 15:07:26.367965
c1dc13bc-c230-48d7-9978-1b9920e9370e	10083362	AIR SOUTH SUDAN	\N	Airsouthsudan98@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.368429	2025-11-13 15:07:26.368429
3a5841ed-a506-4734-9173-d6ba446d2bb2	10023078	ACTIVE TRAVEL	\N	ACTIVECOM.INFO@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.368887	2025-11-13 15:07:26.368887
f324cc20-ae37-42ee-886f-7388599b5b3c	10001838	AVE MARIA TRAVEL	\N	AVEMARIATRAVELAGENCY1@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.36978	2025-11-13 15:07:26.36978
91a24211-82b5-4eed-ba3e-8d79940b7bbe	10041141	ALONYO TRAVEL	\N	ALONYO.SSD@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.370236	2025-11-13 15:07:26.370236
4198e055-01a1-4e6b-b5a5-ecf2db10e761	10083938	INVINCIBLE TRAVEL	\N	Augustinodengo77@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.370856	2025-11-13 15:07:26.370856
9d38c5ca-3ca8-4ceb-8875-3ccfe3fd5f72	10064253	ANAG GLOBAL CO.LTD	\N	Anagglobalcompanyltd@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.371423	2025-11-13 15:07:26.371423
fd8364ce-9b1f-42ef-8048-bfffe5ce33de	10048441	ANTELOPE GLOBAL	\N	ANTELOPEGLOBAL211@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.372279	2025-11-13 15:07:26.372279
fec31b75-1b8a-43a6-961a-29e87a09cc7f	10043541	APPLE-LINK	\N	applelinktravels@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.37281	2025-11-13 15:07:26.37281
081b3800-3d1a-47f6-800d-c3ec28d22bb5	10060570	BLACK ROCK AVIATION	\N	BLACKROCKAVIATIONSERVICES@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.373154	2025-11-13 15:07:26.373154
e8085a42-1018-435a-b5f8-6ec0f4f6d9b2	10002303	SINGO TRAVEL	\N	DIDEJUSTIN@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.373479	2025-11-13 15:07:26.373479
538a8168-7ee7-4aa4-9697-ba3270729306	10022056	BOL DIT Travel	\N	BOLDIT2021@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.373856	2025-11-13 15:07:26.373856
53a16add-3e72-41d7-9689-51997410abf5	10004596	BENDOCH TRADING & INVESTMENT	\N	BENDOCH.T.INVESTMENT@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.375965	2025-11-13 15:07:26.375965
f3c66225-89b9-436b-aeca-ab24f912aff0	10002033	GLOBAL TOURS	\N	GLOBALTRAVELS21@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.376289	2025-11-13 15:07:26.376289
84d7cbe0-518b-4481-b1df-21b7451abbc3	10082021	DREAM WAYS TRAVEL	\N	dreamwaystourism@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.376601	2025-11-13 15:07:26.376601
ed27f8db-83f3-4dd7-ab16-5c315c233794	10018547	GREEN LINE	\N	GREENLINE4TRAVELINGAGENCY@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.376904	2025-11-13 15:07:26.376904
541067f1-a38f-40c3-82e9-d198ac9be8ca	10003478	NEBRAS FOR INVESTMENT	\N	HADIABASADAM@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.377594	2025-11-13 15:07:26.377594
766a1abb-ff70-4b91-b44b-9988786581f0	10078188	INTERJET TRAVEL	\N	Flyinterjet@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.378091	2025-11-13 15:07:26.378091
66e9de8a-4d57-4356-a4f1-681a651fe625	10002619	MALAKAL TRAVEL	\N	MALAKALTRAVELAGENCY@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.37856	2025-11-13 15:07:26.37856
6fb68614-792d-4776-b199-89057c73de88	10082132	EYK GENERAL TRADING	\N	Eyktravelagency25@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.379028	2025-11-13 15:07:26.379028
483d6e4c-6379-4c7c-8b3e-1cda8f838c6a	10039066	EMOSH TOURS	\N	EMOSHTOURSTRAVEL@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.379965	2025-11-13 15:07:26.379965
cd527560-3833-4f9d-909f-5ae148a17fd5	10069283	DISCOVER WINGS	\N	Marketing.ss@discoverwingstravel.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.381644	2025-11-13 15:07:26.381644
bd7755a6-ba4f-474c-a854-5857acb022a3	10001554	OPTIMIST FOR TRAVEL	\N	MIDOAMIDO64@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.382172	2025-11-13 15:07:26.382172
e3e44f9d-911b-4d28-b956-f314e9b74fb6	10070619	MALAQ TRAVEL	\N	Malaqtravel@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.383567	2025-11-13 15:07:26.383567
12ddc864-a556-47a5-8142-c96c35998040	10055475	MANA TRAVEL BOOKING	\N	MANATRAVELBOOKING@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.384496	2025-11-13 15:07:26.384496
ef8daff2-4e2a-455c-b1b4-4b1ccbf658e8	10004346	NADA FOR TRAVEL	\N	NADATRAVELAGENCY@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.384944	2025-11-13 15:07:26.384944
bf826db2-7c68-480a-9c16-06ddb9323572	10003313	JLK TRAVEL	\N	JLKGENERALTRADING021@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.385399	2025-11-13 15:07:26.385399
43bd0b31-0507-462e-8285-eaacc5835ecf	10001531	JODAK TRAVEL	\N	JODAKTRAVELS2013@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.38585	2025-11-13 15:07:26.38585
1f489418-3102-47b6-9a8c-2db366f37c1a	10002581	INFOLINKS EXPRESS	\N	JOHN.INFOLINKS@YAHOO.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.38629	2025-11-13 15:07:26.38629
3000c366-b821-4013-a43c-1d059529c98d	10076262	MICH TRAVEL	\N	Michtravel25@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.386733	2025-11-13 15:07:26.386733
f30f98e4-41c2-44e3-8fcd-0c8643df76d1	10017680	MWM TRAVEL	\N	MWMTRAVEL8@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.387665	2025-11-13 15:07:26.387665
4fc0f9ae-c2fd-49ae-a4f5-820c5c3073ff	10039074	KEWER TRAVEL	\N	KEWERTRAVELAGENCY@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.388747	2025-11-13 15:07:26.388747
dc685389-b46b-488f-b903-fc8d4743043b	10003519	MUTHAIGA TRAVEL	\N	jacob@muthaiga.co.ke	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.364356	2025-12-05 10:45:29.021439
36fcec7a-96fd-4a1e-85db-7742ced216e5	10062888	NAL	\N	NALGENERALTRADING2024@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.389242	2025-11-13 15:07:26.389242
356cf27f-35d5-432e-b7e1-67ace76053e0	10066912	WAHEGURU TRAVEL	\N	juba@wahegurutravels.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.390038	2025-11-13 15:07:26.390038
316a4382-c50f-4fc2-8e36-7b4dd22b1a61	10004007	MIAMI TRAVEL	\N	JIJJOHN94@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.36366	2025-12-09 09:59:46.077587
c846fd1b-0329-49dd-be3f-536732398bdf	10023277	DOVE LINK	\N	DOVELINKTRAVELANDTOURISM@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.37517	2025-12-16 12:05:18.925952
c4629f98-e943-497b-9f67-00e7237ebf0a	10017015	QUEEN'S EMPIRE	\N	EMPIREQ288@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.38312	2025-12-08 13:39:54.015946
3fc16d1d-5a89-4ce8-a1c4-67cc031845f7	10004402	GLOBAL STARS TRAVEL	\N	GLOBALSTARSTRAV@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.38042	2025-12-30 12:05:36.389179
6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	10003955	FLYAWAY TRAVEL	\N	GABRIELDHEU2018@GMAIL.COM	\N	\N	\N	0.00	400.00	t	2025-11-13 15:07:26.375611	2026-01-05 15:13:18.449409
9f7b27a4-b866-4e8f-9138-c385cf2b4f0c	10003307	CLASSIC TRAVEL	\N	EMMA.GINABA400@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.379482	2025-12-30 14:07:55.400552
6fc69780-b82a-415c-8022-dbe458b200d9	10055804	GOLDEN STAR	\N	GOLDENSTARTRAVEL@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.38096	2025-12-12 11:20:16.561376
211317cb-7002-4abc-8350-ea60cd33dcd7	10005094	NEVIN GENERAL TRADING	\N	AMANIJUMALADO21@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.374332	2025-12-14 09:56:20.279451
0f639da7-b8ae-4671-a1ce-d66c76169567	10057853	JUBA ROYAL	\N	INFO@JUBAROYALTRAVEL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.365554	2026-01-05 14:59:09.912085
c21e9a75-8949-49c2-b2c9-ff6c316fae26	10003326	ROKON TRAVEL	\N	NAZIREZEDING@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.384033	2026-01-05 14:59:45.742593
a8eb6611-3c8e-4b67-a269-68033e418688	10003919	ABANOS LINKS FOR GENERAL TRADING	\N	ABANOSLINKSSSD@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.363476	2025-12-20 12:03:43.731103
8e34184e-2091-4691-a5dc-329a22d316e9	10018550	A24GENERAL	\N	A24TRAVELAGENCY@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.364818	2025-12-31 10:21:41.249163
92988962-c192-4f5c-8cdc-a0d063110479	10003321	KUPERA TRAVEL	\N	JOICECHARLES19@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.387191	2026-01-05 14:59:27.829202
5515cbf4-6ee1-435a-aeb4-5e433cc31cd0	10009591	NEW BEGINNING TRAVEL	\N	NEWBEGINNINGTRAVELANDTOURS@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.390537	2025-11-13 15:07:26.390537
8661f302-999b-45dd-b25c-f279533befad	10057397	SATGURU TRAVEL	\N	MARKETING.JUBA@SATGURUTRAVEL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.391318	2025-11-13 15:07:26.391318
7740164d-76a8-4530-8480-398ac5af985f	10048906	NEXT DESTINATION	\N	NEXTDESTINATION184@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.391915	2025-11-13 15:07:26.391915
0ed58a6a-5810-4495-8be1-5fd697fe2ae2	10053807	KATY COMPANY	\N	KATYCOMPANYLIMITED@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.392388	2025-11-13 15:07:26.392388
77fda823-6bdf-4fc9-8530-f96a3e648550	10043995	JOHNSON TRAVEL	\N	JOICECEASAR8115@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.392903	2025-11-13 15:07:26.392903
088b46de-39dd-472c-9c08-7d34e6e2b777	10041092	KING CROWN	\N	KINGCROWN66COMPANY@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.393386	2025-11-13 15:07:26.393386
d473a0f4-eff5-41bf-a301-8c9f74d55b4b	10023220	KURA General Trading	\N	kuraeasywaytravelagency@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.393845	2025-11-13 15:07:26.393845
fe473fc7-54eb-497e-a9b4-a775d088fcc1	10044723	TEST TA	\N	MOHD.ALAMEEN@ICLOUD.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.394755	2025-11-13 15:07:26.394755
84852b83-ffcb-411d-be4b-3c194a999d68	10067512	JUDE TRAVEL	\N	Judetravels50@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.395199	2025-11-13 15:07:26.395199
af162ea1-66d7-4fdd-92fb-5d69ae46ba75	10001792	K.GLOBAL ISLAND TRAVEL	\N	LINOKUR33@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.395664	2025-11-13 15:07:26.395664
30763fba-d90c-4d19-8584-3dfe27b98371	10042868	LEED GLOBAL	\N	LEEDSERVICES1@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.396141	2025-11-13 15:07:26.396141
e430e359-ed0e-48cb-9bc8-8676f9836aa5	10006583	LIGHT FOR IMPORT AND EXPORT	\N	LIGHTCOMPANY199@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.397379	2025-11-13 15:07:26.397379
4be0e1ae-b1c7-42fd-b2d1-1ae7ffc7e31e	10090611	STEP LIFE	\N	KURAYULTHOMASABAN@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.398379	2025-11-13 15:07:26.398379
d7a1e78b-7f05-4a19-bebd-75c764a1fce4	10006863	NYIKAYO FOR TRADING	\N	nyikayotradininve@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.39886	2025-11-13 15:07:26.39886
1066dc33-9540-421a-8d2f-e52e1a004382	10046377	PRINCESS AVIATION	\N	PRINCESSAVIATION404@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.400208	2025-11-13 15:07:26.400208
44c22ee6-87bb-48a0-a78b-d7e244f4a7bd	10088043	RAYYAN TOURISM	\N	RAYYANTOURISMTRAVEL24@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.400708	2025-11-13 15:07:26.400708
dd35069f-40bd-423b-9b0a-edc6781db7a5	10086203	NILE LIFE	\N	NILELIFEINVESTMENTCOLTD@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.401337	2025-11-13 15:07:26.401337
bd7c75e3-931e-48e2-9da1-7e0655e8299b	10001995	EASY TRAVEL	\N	ROTICH@EASYJUBA.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.40184	2025-11-13 15:07:26.40184
3276bf6c-e1cc-4791-9e0d-44d6a9966ba4	10054983	METBEEN	\N	PWOJWOKADINE@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.402304	2025-11-13 15:07:26.402304
e8706d34-8ad8-4cce-9b0e-54179777f93a	10002800	EXECUTIVE ADVENTURES	\N	RESERVATION@EXECUTIVE-TRAVEL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.40368	2025-11-13 15:07:26.40368
81642bfc-31dc-49bf-9008-2a4fa2babe4e	10002054	SKY DOVE TOURS	\N	SKYDOVETRAVEL@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.4042	2025-11-13 15:07:26.4042
5dbed538-75e8-4814-bf53-2246d17e8f84	10017228	APEX TRAVEL	\N	SALES.APXMODERNLTD@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.404886	2025-11-13 15:07:26.404886
4409d9cb-e256-4088-99ee-8a257cac99bf	10002010	SKY HIGH TRAVEL	\N	SKYHIGH26TRAVEL@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.405151	2025-11-13 15:07:26.405151
8376c3ab-400f-4253-a098-838cde22e14d	10024093	REFIG AGENCY	\N	REFIG.TRAVEL@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.406937	2025-11-13 15:07:26.406937
f5d5c385-aa67-4569-8e2d-becb2df1193c	10019019	SKY AVIATION	\N	RESERVATIONS.SKYAVIATIONSS@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.408034	2025-11-13 15:07:26.408034
d5d91ba8-67bd-46d4-ae6f-0adc792fa66b	10085778	5G ADVISORY	\N	rosyyoung57@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.408583	2025-11-13 15:07:26.408583
4bcc794f-86b2-44aa-880c-66967e906df3	10004588	AO TRAVEL	\N	SUZAN.ABANI2000@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.409097	2025-11-13 15:07:26.409097
60fb4144-ba84-48b6-940c-b5fb58bd0ee7	10018596	TESFA TRAVEL	\N	TESFATRAVELJUBA@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.409697	2025-11-13 15:07:26.409697
c94db3c4-3055-4465-86c6-3993bb4826c2	10024434	SUDD PETROLEUM OPERATING CO.LTD.	\N	SPOC@SPOC.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.410974	2025-11-13 15:07:26.410974
0bd434f3-f0ed-41d5-835e-acbc9479b1d9	10068490	STOCK TRAVEL	\N	Stocklogisticsupply@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.412086	2025-11-13 15:07:26.412086
9cb5fbf2-9fae-4518-a5da-f5bb6b63aa13	10053686	GIFTSTAR GENERAL	\N	TRAVELAVIATION@GIFTSTARLLC.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.412542	2025-11-13 15:07:26.412542
cc21613a-e018-4958-b1f3-ba046afe9d5e	10047538	SUPER POWER	\N	SUPERPO602@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.413091	2025-11-13 15:07:26.413091
7136d6c5-245b-421b-9bbb-84c637cf1577	10061318	SKY ELITE	\N	SKYELITETRAVELANDTOURS@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.413583	2025-11-13 15:07:26.413583
06051b75-d549-46f1-8e7c-7593b1578f13	10068001	DEVINE TRAVEL	\N	Travel@devinetraveljuba.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.414753	2025-11-13 15:07:26.414753
a0d076c3-d195-405c-b9d3-6faed236a3bc	10003949	JETLADY COMPANY	\N	YARMATHET1@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.415103	2025-11-13 15:07:26.415103
dcefee53-e31c-44d8-8a12-fdeead474957	10024762	TEST	\N	test@test.fr	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.415493	2025-11-13 15:07:26.415493
10ab9673-cc9e-4f19-b920-7b1fc1925dd1	10058919	SMART TRIP	\N	SMARTTRIP.SSD@HOTMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.415895	2025-11-13 15:07:26.415895
e9457736-1c31-4b00-a9ed-c888aca31f2e	10071827	TRIUMPHANT TRAVEL	\N	TRIUMPHANTRAVLOGS@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.41676	2025-11-13 15:07:26.41676
f828c186-489b-482f-825d-346415a7d840	10002723	ZICO TRAVEL	\N	ZICOTRAVELS@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.417399	2025-11-13 15:07:26.417399
acd822cd-9ce5-46e1-9a40-917c1ef63a27	10018607	CROSSANDRA	\N	CROSSANDRA@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.41769	2025-11-13 15:07:26.41769
006a2915-c212-491c-8616-0e8b6d675079	10005479	SULTAN & PARTNERS	\N	BOLSANTA35@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.417981	2025-11-13 15:07:26.417981
ee3455fe-2bf7-487c-8e25-e2dc57b63d3d	10025482	HAPPY DESTINATIONS	\N	WOLAYANG98@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.418938	2025-11-13 15:07:26.418938
e5637070-3483-46e6-9b4f-5e03c1f1d211	10075502	GOOL FOR TRANSPORTATIONS	\N	Bushaykak163@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.419433	2025-11-13 15:07:26.419433
e21cbb1d-137a-4ed8-b5e4-00e828e9f278	10054627	ABU ALAQEED SONS	\N	WEZZYFLY8@ICLOUD.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.420124	2025-11-13 15:07:26.420124
a638a2b5-611b-4b72-90df-911f4c9f823e	10044306	NOAH ARARAT	\N	YOANEISM@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.420431	2025-11-13 15:07:26.420431
93da34c6-b76f-48e7-a2c1-57de6b2082fa	10004301	WADHJOK MULTIPURPOSE CO	\N	OMINIDAKADIAN@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.397926	2025-12-01 13:35:22.269384
d9d6b51f-9192-47c5-9b00-6de514dc9b70	10004749	MAY TRAVEL	\N	NYABOUMLUAL998@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.396636	2025-12-03 11:25:31.10258
61c18c87-f840-43d5-91ea-0c9c54a80040	10046415	BEST TRAVEL & CARGO INTERNATIONAL CO.LTD	\N	DANIELMALANGMADENG@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.420696	2025-11-13 15:07:26.420696
d9a941c2-1f0f-42e0-b2cf-b39c1e6d0e84	10067422	COMFORT SKY	\N	Choldau33@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.421669	2025-11-13 15:07:26.421669
b5913363-71c9-41cd-97c8-309e5a087b2d	10042400	WASCO GENERAL TRADING	\N	WASCO7799@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.421915	2025-11-13 15:07:26.421915
9f5aed3b-a66e-4b40-acae-7a21ced33164	10002786	TOBAAIR TRAVEL	\N	PETERBARACH982@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.402769	2026-01-05 10:19:46.74123
2100ae22-fca2-454a-b231-03689a671844	10062284	SOLO TRAVEL	\N	SOLOTRAVELLIMITED@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.414393	2025-12-08 13:40:19.98277
f925cb0f-5b64-4efa-aa01-f58f2aa7b5f1	10019100	SOUTH QUALITY	\N	SOUTHQUALITY7@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.411579	2025-12-22 15:27:17.943889
d9fedfe6-0d89-49fe-b06c-97529354a88c	10001571	DAHAWEY TRAVEL	\N	DAHAWEY2013@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.418311	2026-01-03 10:35:31.530918
970181ef-e333-4707-b74c-f6818f947fd6	10003916	SURA FOR GENERAL TRADING	\N	RINA.MODESTO88@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.399753	2026-01-05 15:17:58.61693
f3d21b8c-c1d8-415f-ab1e-6307eb765b77	10050347	SKY LIGHT	\N	Skylighttravel24@gmail.com	\N	\N	\N	0.00	1000.00	t	2025-11-13 15:07:26.414	2026-01-03 10:00:33.816889
86b93c70-e8e1-4bce-8182-c626b082b8bf	10000450	MANGALA TRADING	\N	THOMASALPHONSE2015@GMAIL.COM	\N	\N	\N	0.00	10000.00	t	2025-11-13 15:07:26.417097	2026-01-05 14:22:27.568499
40d63f00-ddc5-4f8c-aa25-cd57c5e237de	10003933	MOONLIGHT TRAVEL	\N	RESERVATIONS@MOONLIGHTSSD.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.399308	2025-12-29 16:14:19.035805
1602c2a5-5908-4cbf-b14a-73d18ffafbd6	10018589	ALMUHAJIR TRAVEL	\N	Sjgong2020@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.403237	2025-12-16 14:19:01.602534
b54aa6a7-6276-48fc-a282-5a097f870f33	10004568	MATIDELLA FOR GENERAL TRADING	\N	SAIFASMA094@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.407494	2025-12-30 16:12:11.103259
8264a667-ae81-48b9-84fd-d795f170737c	10047389	PIONEER INVESTMENT	\N	pioneerinvestment22@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.406307	2026-01-03 10:41:55.784003
54ec73e6-4d0c-45b1-85d2-fa8d44751b26	10059922	WATHALEL AVIATION	\N	WATHALEL2013@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.422196	2025-11-13 15:07:26.422196
48c75540-955e-4fa8-a024-b61780e4e248	10093731	ROSE HOPE TRAVEL	\N	Rosehope.co.ltd@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-18 12:41:03.271503	2025-11-18 12:41:03.271503
cb7b9deb-3a42-46e4-ac5a-b1440c346f66	10053522	DABAD BROTHERS	\N	DABADBROTHERS@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.422474	2025-12-05 12:58:40.342085
3aefd7d8-f08a-40f7-a105-c2d0d15b1083	10001570	JUMA TRAVEL	\N	JUMAJALLY@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.388139	2025-12-06 11:37:55.115396
0f29f61e-5381-4140-bd0a-3c650583b0aa	10095634	KIADEN TRAVEL	\N	Kiadenagency@gamil.com	\N	\N	\N	0.00	0.00	t	2025-11-28 13:01:26.649493	2025-11-28 13:01:26.649493
580f7ae4-f6fd-4fd4-8a4f-46a53bc3fc36	10077053	ALOR AIRLINES	\N	ngorchol86@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.394298	2026-01-02 12:51:01.767304
93c192e6-74cd-42ff-b0c3-157ed7865cef	10056047	CALIBRE SOLUTION	\N	CALIBRETOURSANDTRAVEL@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.421169	2025-12-23 13:16:07.246004
4700bec5-6fb9-4f8e-ad4e-6b09f81df49a	10002017	TRICE EXPRESS TRAVEL	\N	MONTASIRFARH2016@GMAIL.COM	\N	\N	\N	0.00	1000.00	t	2025-11-13 15:07:26.38265	2026-01-03 12:58:39.741422
568324bd-0670-46b0-a448-49986d773d95	10051653	ROOFLINE TRAVEL	\N	rooflineagency@gmail.com	\N	\N	\N	0.00	1000.00	t	2025-11-13 15:07:26.416301	2026-01-05 14:58:02.854966
f1a649dc-16a2-4253-b936-355894b25d72	10066982	MUSAFIR TRAVEL	\N	ajakbolyout@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.369337	2026-01-05 15:13:30.276781
7627a189-2adf-4bea-8bb0-dcd113b9c865	10049883	MAJUER TRAVELS	\N	DENGADUTDIT@GMAIL.COM	\N	\N	\N	0.00	2000.00	t	2025-11-13 15:07:26.419766	2026-01-05 15:13:51.592066
dba747bc-6b58-44b5-9c5a-88376604bf41	10003936	3 STARS TRAVEL	\N	3STARSTRAVEL@GMAIL.COM	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.363107	2026-01-05 15:14:20.822485
6bbc4e6f-aac0-43fc-8235-82d517012bba	10090799	ZERO NINE	\N	Zeronine467@gmail.com	\N	\N	\N	0.00	0.00	t	2025-11-13 15:07:26.421436	2025-12-19 10:57:23.330383
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_logs (id, user_id, receipt_id, action, old_value, new_value, ip_address, user_agent, created_at) FROM stdin;
\.


--
-- Data for Name: expense_codes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.expense_codes (id, code, name, category, currencies_allowed, requires_receipt, is_active, created_at, updated_at) FROM stdin;
4f203f0c-2bc4-480b-a07a-81ab09c51e5a	FUEL-001	Aircraft Fuel Payment	Operations	{USD,SSP}	f	t	2026-01-01 09:38:25.897164	2026-01-01 09:38:25.897164
b1c43091-db83-497a-92cf-69c0bc26063f	FUEL-002	Ground Vehicle Fuel	Operations	{SSP}	f	t	2026-01-01 09:38:25.897164	2026-01-01 09:38:25.897164
084a8040-9598-4211-89d5-92e1ae86ab0b	SUPPL-001	Office Supplies	Admin	{SSP}	f	t	2026-01-01 09:38:25.897164	2026-01-01 09:38:25.897164
0ff0c742-9924-421b-9035-c757e509770d	SUPPL-002	Cleaning Supplies	Admin	{SSP}	f	t	2026-01-01 09:38:25.897164	2026-01-01 09:38:25.897164
fd7c4a97-6ae1-40ba-a4d4-8732d43ab98c	SECURITY-001	Security Services	Operations	{USD,SSP}	f	t	2026-01-01 09:38:25.897164	2026-01-01 09:38:25.897164
a5f84928-f136-4e1e-afed-992fa9c3b6b0	CATERING-001	Crew Catering	Operations	{USD,SSP}	f	t	2026-01-01 09:38:25.897164	2026-01-01 09:38:25.897164
6df13579-0ac5-4145-ad5b-88639de695a1	HANDLING-001	Ground Handling Fees	Operations	{USD}	f	t	2026-01-01 09:38:25.897164	2026-01-01 09:38:25.897164
a96ab833-bf8f-4bab-8f36-a1eed2460d28	COMM-001	Communication Expenses	Admin	{SSP}	f	t	2026-01-01 09:38:25.897164	2026-01-01 09:38:25.897164
a879420e-73c6-47ed-8ca7-fb4773a5c6a6	TRANSPORT-001	Local Transport	Operations	{SSP}	f	t	2026-01-01 09:38:25.897164	2026-01-01 09:38:25.897164
e79436b3-2536-47c0-89b7-403a8bd24971	MISC-001	Miscellaneous Expense	Admin	{USD,SSP}	f	t	2026-01-01 09:38:25.897164	2026-01-01 09:38:25.897164
3acb1390-c590-43c3-88ac-f08efabb9c31	1234	CAR RENT	STATION	{USD,SSP}	f	f	2026-01-01 10:13:13.546493	2026-01-01 10:19:52.571473
f70625d4-f6ee-4b05-9a60-e0d923332ef3	124CR	CAR RENT	\N	{USD,SSP}	f	f	2026-01-01 10:12:10.242203	2026-01-01 10:19:54.745559
\.


--
-- Data for Name: offline_queue; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.offline_queue (id, user_id, action_type, payload, retry_count, is_synced, error_message, created_at, synced_at) FROM stdin;
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payments (id, receipt_id, payment_number, amount, payment_date, payment_time, payment_method, remarks, created_by, created_by_name, created_at) FROM stdin;
17	894fe02e-4bdc-40f9-9968-c26c9c42d80b	KU251118-PAY-6417	1100.00	2025-11-18	23:45:29	CASH	\N	53e3741b-51ee-4d66-9f6b-33ecabd8b463	Ahmed Sami	2025-11-18 23:45:29.517609
18	894fe02e-4bdc-40f9-9968-c26c9c42d80b	KU251120-PAY-5672	1100.00	2025-11-20	11:39:40	CASH	\N	53e3741b-51ee-4d66-9f6b-33ecabd8b463	Ahmed Sami	2025-11-20 11:39:40.383237
19	c8456e79-c052-4800-8dea-080a10b68413	KU251204-PAY-5263	100.00	2025-12-04	13:15:08	CASH	\N	53e3741b-51ee-4d66-9f6b-33ecabd8b463	Ahmed Sami	2025-12-04 13:15:08.171768
\.


--
-- Data for Name: receipts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.receipts (id, receipt_number, agency_id, user_id, amount, currency, payment_method, status, issue_date, issue_time, payment_date, due_date, station_code, issued_by_name, purpose, remarks, transaction_ref, document_hash, is_synced, is_void, void_reason, void_date, created_at, updated_at, amount_paid, amount_remaining) FROM stdin;
9bdea502-e117-41e8-9dff-93fc14400161	KU-CR-JUB-20251114-8370	dba747bc-6b58-44b5-9c5a-88376604bf41	53e3741b-51ee-4d66-9f6b-33ecabd8b463	100.00	USD	CASH	PAID	2025-11-14	09:20:47	2025-11-14 07:20:47.633	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	test receipt	2025-11-14 09:23:31.569361	2025-11-14 09:20:47.674219	2025-11-14 09:23:31.569361	100.00	100.00
3d3103fc-c9e6-4466-a045-3e0288ed5cbe	KU-CR-JUB-20251114-0475	e5637070-3483-46e6-9b4f-5e03c1f1d211	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-14	09:24:06	2025-11-14 07:24:06.549	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-14 09:24:06.55141	2025-11-14 09:24:06.55141	500.00	500.00
8708d541-72fc-4193-9fd5-31df9d101722	KU-CR-JUB-20251114-0276	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-14	09:43:10	2025-11-14 07:43:10.642	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-14 09:43:10.663059	2025-11-14 09:43:10.663059	200.00	200.00
de1bf44a-c2fb-4466-8da2-e6d62a9ee1b4	KU251124-0002	93da34c6-b76f-48e7-a2c1-57de6b2082fa	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-11-24	10:25:46	2025-11-24 08:25:46.657	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-24 10:25:46.660737	2025-11-24 10:25:46.660737	0.00	\N
a3abc575-0266-4d9a-adf0-c4fa925436ac	KU-CR-JUB-20251114-9560	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1440.00	USD	CASH	PAID	2025-11-14	09:46:28	2025-11-18 09:43:20.913	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-14 09:46:28.098604	2025-11-18 11:43:20.913985	0.00	1440.00
a9999a2e-a34e-4de2-a79e-71219f0a1a99	KU251124-0005	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PENDING	2025-11-24	17:23:17	\N	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	conflict with numbers	2025-11-24 17:37:43.983687	2025-11-24 17:23:17.939618	2025-11-24 17:37:43.983687	0.00	\N
cc0cf447-b8dd-4e2c-9573-8b1fbb90b5d5	KU251124-0007	9f7b27a4-b866-4e8f-9138-c385cf2b4f0c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-24	17:40:24	2025-11-24 15:40:24.206	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-24 17:40:24.207305	2025-11-24 17:40:24.207305	0.00	\N
35d25a6e-eab7-40f2-8db8-a066100eb507	KU251124-0012	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1200.00	USD	CASH	PAID	2025-11-24	17:42:38	2025-11-24 15:42:38.92	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-24 17:42:38.920972	2025-11-24 17:42:38.920972	0.00	\N
0be012fa-1b4a-459b-8dbc-9678f59eaa5d	KU251124-0016	ed27f8db-83f3-4dd7-ab16-5c315c233794	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-24	17:55:27	2025-11-24 15:55:27.322	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-24 17:55:27.323173	2025-11-24 17:55:27.323173	0.00	\N
cf7fc753-c690-4484-b2e4-209850e695a3	KU251125-0001	c21e9a75-8949-49c2-b2c9-ff6c316fae26	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-25	08:11:44	2025-11-25 06:11:44.416	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-25 08:11:44.418701	2025-11-25 08:11:44.418701	0.00	\N
d82a83ad-cba6-4dad-973c-aa0e40b026fc	KU251125-0003	1f489418-3102-47b6-9a8c-2db366f37c1a	6204b8eb-b190-4992-ad03-4dbb161cfff2	700.00	USD	CASH	PAID	2025-11-25	08:37:51	2025-11-25 06:37:51.04	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-25 08:37:51.040772	2025-11-25 08:37:51.040772	0.00	\N
bb73d441-9625-41a2-91bc-07fbc20f595d	KU251117-0007	86b93c70-e8e1-4bce-8182-c626b082b8bf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	10000.00	USD	CASH	PAID	2025-11-17	11:37:18	2025-11-25 06:46:22.771	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-17 11:37:18.364241	2025-11-25 08:46:22.771546	0.00	\N
e86a9b42-016c-4f47-af41-7d5cccc988d7	KU251125-0005	1f489418-3102-47b6-9a8c-2db366f37c1a	53e3741b-51ee-4d66-9f6b-33ecabd8b463	100.00	USD	CASH	PAID	2025-11-25	09:52:08	2025-11-25 07:52:08.192	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-25 09:52:08.19275	2025-11-25 09:52:08.19275	0.00	\N
be265407-e68d-4d01-8b57-311e62c20f56	KU251125-0011	81642bfc-31dc-49bf-9008-2a4fa2babe4e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-25	11:42:30	2025-11-25 09:42:30.685	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-25 11:42:30.697906	2025-11-25 11:42:30.697906	0.00	\N
e7cbde44-9d77-47d8-b126-a17df47a214d	KU251125-0013	bd7755a6-ba4f-474c-a854-5857acb022a3	53e3741b-51ee-4d66-9f6b-33ecabd8b463	100.00	USD	CASH	PAID	2025-11-25	12:43:56	2025-11-25 10:43:56.652	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-25 12:43:56.667755	2025-11-25 12:43:56.667755	0.00	\N
fe5211d7-5c53-43eb-bebb-bc681a635405	KU251124-0017	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-11-24	19:55:13	2025-11-25 11:31:33.84	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-24 19:55:13.943646	2025-11-25 13:31:33.840664	0.00	\N
8690b155-0c36-4717-8f63-0e41b793e76a	KU251124-0010	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	350.00	USD	CASH	PAID	2025-11-24	17:41:29	2025-11-25 11:32:29.155	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-24 17:41:29.935821	2025-11-25 13:32:29.1555	0.00	\N
152fd818-a599-4248-87aa-25f9b479bdfc	KU251125-0015	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-25	14:09:15	2025-11-25 12:09:15.624	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-25 14:09:15.626085	2025-11-25 14:09:15.626085	0.00	\N
a6f2541c-04db-4548-8f29-27aa8fab5755	KU251125-0012	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-25	11:47:22	2025-11-25 12:20:23.515	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-25 11:47:22.98308	2025-11-25 14:20:23.515342	0.00	\N
afb217c8-f6b1-4976-b31f-6930fb8f9e8f	KU-CR-JUB-20251113-2131	3aefd7d8-f08a-40f7-a105-c2d0d15b1083	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PENDING	2025-11-13	15:57:39	\N	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	will start from today	2025-11-14 09:02:45.449986	2025-11-13 15:57:39.819919	2025-11-14 09:02:45.449986	0.00	200.00
1b52ff8a-bffe-45af-81f4-9c4e05f01fe1	KU-CR-JUB-20251113-3344	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PENDING	2025-11-13	15:51:21	\N	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	will start from today	2025-11-14 09:03:00.833687	2025-11-13 15:51:21.728707	2025-11-14 09:03:00.833687	0.00	300.00
efe57bcb-e635-45cc-a8ed-447ff19a4aa0	KU251125-0017	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-25	14:21:40	2025-11-25 12:21:40.648	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-25 14:21:40.648901	2025-11-25 14:21:40.648901	0.00	\N
8d2d6084-4111-4d10-8c3d-d1c66304e373	KU251125-0018	bd7755a6-ba4f-474c-a854-5857acb022a3	53e3741b-51ee-4d66-9f6b-33ecabd8b463	720.00	USD	CASH	PAID	2025-11-25	15:36:46	2025-11-25 13:36:46.003	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-25 15:36:46.005999	2025-11-25 15:36:46.005999	0.00	\N
7bbd3489-95d9-455b-b3e3-ae7521d7d086	KU251125-0016	81642bfc-31dc-49bf-9008-2a4fa2babe4e	02a25259-aec1-4f90-ac51-d302eb267d3a	200.00	USD	CASH	PAID	2025-11-25	14:20:34	2025-11-25 12:20:34.467	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	t	DOVE LINK	2025-11-25 16:21:52.538635	2025-11-25 14:20:34.468413	2025-11-25 16:21:52.538635	0.00	\N
3bc6452a-b674-4d2b-b80e-1ea331771e2a	KU251125-0019	c846fd1b-0329-49dd-be3f-536732398bdf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-25	16:25:07	2025-11-25 14:25:07.143	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-25 16:25:07.155114	2025-11-25 16:25:07.155114	0.00	\N
28b9025a-504a-4e29-b8e1-29468cd44c49	KU251125-0020	c846fd1b-0329-49dd-be3f-536732398bdf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-25	16:51:39	2025-11-26 08:12:13.876	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-25 16:51:39.778637	2025-11-26 10:12:13.876668	0.00	\N
315eb10a-917c-4099-a6cc-3de7de5c4aa2	KU251125-0014	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-25	12:51:47	2025-11-26 08:12:30.165	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-25 12:51:47.531893	2025-11-26 10:12:30.165571	0.00	\N
71a95a8a-6e99-49eb-95dd-7ebae18d7069	KU251125-0007	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-25	10:26:54	2025-11-26 08:12:44.813	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-25 10:26:54.813305	2025-11-26 10:12:44.814015	0.00	\N
2c12327a-be3d-4c8d-89da-104a88f4d37a	KU251126-0001	e8085a42-1018-435a-b5f8-6ec0f4f6d9b2	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-26	10:18:17	2025-11-26 08:18:17.869	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-26 10:18:17.872264	2025-11-26 10:18:17.872264	0.00	\N
192c6e69-436a-48d5-a07e-12946661f146	KU251126-0002	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	600.00	USD	CASH	PAID	2025-11-26	10:36:12	2025-11-26 08:36:12.068	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-26 10:36:12.071177	2025-11-26 10:36:12.071177	0.00	\N
f24aace5-27e8-4f85-9dfe-8314bbbeac29	KU251126-0003	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-11-26	10:37:28	2025-11-26 08:37:28.865	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-26 10:37:28.867398	2025-11-26 10:37:28.867398	0.00	\N
9f67af80-0c43-4835-b438-ee14f0e51d7f	KU251126-0004	3276bf6c-e1cc-4791-9e0d-44d6a9966ba4	53e3741b-51ee-4d66-9f6b-33ecabd8b463	120.00	USD	CASH	PAID	2025-11-26	11:23:48	2025-11-26 09:23:48.022	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-26 11:23:48.030382	2025-11-26 11:23:48.030382	0.00	\N
f28e1c56-8d37-44ca-8cc5-3184f7576f2d	KU251126-0005	3a5841ed-a506-4734-9173-d6ba446d2bb2	53e3741b-51ee-4d66-9f6b-33ecabd8b463	460.00	USD	CASH	PAID	2025-11-26	11:29:09	2025-11-26 09:29:09.574	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-26 11:29:09.575805	2025-11-26 11:29:09.575805	0.00	\N
1df98f81-3b7a-4802-90b6-2870292e035e	KU251126-0006	bd7755a6-ba4f-474c-a854-5857acb022a3	53e3741b-51ee-4d66-9f6b-33ecabd8b463	100.00	USD	CASH	PAID	2025-11-26	12:09:58	2025-11-26 10:09:58.635	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-26 12:09:58.643432	2025-11-26 12:09:58.643432	0.00	\N
1e650513-4380-4b70-a0cf-690e4591d988	KU251126-0007	d9fedfe6-0d89-49fe-b06c-97529354a88c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-26	12:30:49	2025-11-26 10:30:49.674	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-26 12:30:49.691047	2025-11-26 12:30:49.691047	0.00	\N
b005c955-db91-4282-ad23-2795548c9dd8	KU251125-0009	970181ef-e333-4707-b74c-f6818f947fd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-11-25	10:44:30	2025-11-28 14:20:41.729	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-25 10:44:30.372291	2025-11-28 16:20:41.730271	0.00	\N
0d5ab054-66bc-4940-80da-241752b8197f	KU251124-0003	c172adc1-51a7-4b98-ac66-6be0ca8ad76c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-24	11:57:08	2025-11-24 09:57:08.854	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-24 11:57:08.866464	2025-11-24 11:57:08.866464	0.00	\N
41a86836-8757-4b09-95db-6d41b40577f4	KU251114-5704	dba747bc-6b58-44b5-9c5a-88376604bf41	53e3741b-51ee-4d66-9f6b-33ecabd8b463	10.00	USD	CASH	PAID	2025-11-14	09:58:56	2025-11-14 07:58:56.16	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	test	2025-11-14 09:59:14.924359	2025-11-14 09:58:56.182183	2025-11-14 09:59:14.924359	10.00	10.00
94643db5-35e9-41e7-aa0d-d2900b152e51	KU251114-9637	9f7b27a4-b866-4e8f-9138-c385cf2b4f0c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-14	10:11:47	2025-11-14 08:11:47.47	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-14 10:11:47.471341	2025-11-14 10:11:47.471341	500.00	500.00
9ab1982e-a8a8-41ac-b5db-4bb35a55f537	KU251114-2037	dba747bc-6b58-44b5-9c5a-88376604bf41	02a25259-aec1-4f90-ac51-d302eb267d3a	10.00	USD	CASH	PAID	2025-11-14	10:48:13	2025-11-14 08:48:13.585	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	t	test	2025-11-14 10:48:37.510877	2025-11-14 10:48:13.606643	2025-11-14 10:48:37.510877	10.00	10.00
a8148e81-4aa4-4b0d-8250-03d40b20580f	KU251114-9410	2100ae22-fca2-454a-b231-03689a671844	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-14	11:00:51	2025-11-14 09:00:51.042	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-14 11:00:51.042781	2025-11-14 11:00:51.042781	200.00	200.00
b087767c-ea80-410a-8e95-418bf5b77587	KU251114-1483	81642bfc-31dc-49bf-9008-2a4fa2babe4e	02a25259-aec1-4f90-ac51-d302eb267d3a	500.00	USD	CASH	PAID	2025-11-14	11:10:04	2025-11-14 09:10:04.333	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-14 11:10:04.33496	2025-11-14 11:10:04.33496	500.00	500.00
fcd9c72e-3ed7-44a3-98ca-dc73bea86dd6	KU251114-5644	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	02a25259-aec1-4f90-ac51-d302eb267d3a	1000.00	USD	CASH	PAID	2025-11-14	12:26:59	2025-11-14 10:26:59.209	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-14 12:26:59.212111	2025-11-14 12:26:59.212111	1000.00	1000.00
dc7cf74e-bb69-4160-bae7-1b3e6a4c1e4f	KU251114-0128	f3d21b8c-c1d8-415f-ab1e-6307eb765b77	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1500.00	USD	CASH	PAID	2025-11-14	13:23:26	2025-11-14 11:23:26.827	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-14 13:23:26.828076	2025-11-14 13:23:26.828076	1500.00	1500.00
57a1d393-02d2-4667-aae2-6b539c4a0fc2	KU251114-0687	93da34c6-b76f-48e7-a2c1-57de6b2082fa	02a25259-aec1-4f90-ac51-d302eb267d3a	170.00	USD	CASH	PAID	2025-11-14	13:30:30	2025-11-14 11:30:30.107	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-14 13:30:30.108423	2025-11-14 13:30:30.108423	170.00	170.00
bdf40ef8-9eef-4372-96d6-197e25b99195	KU251114-2359	53a16add-3e72-41d7-9689-51997410abf5	53e3741b-51ee-4d66-9f6b-33ecabd8b463	250.00	USD	CASH	PAID	2025-11-14	13:33:59	2025-11-14 11:33:59.825	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-14 13:33:59.826853	2025-11-14 13:33:59.826853	250.00	250.00
0a844c7d-a9fc-446c-8959-f5c8946031f0	KU251114-2401	4198e055-01a1-4e6b-b5a5-ecf2db10e761	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-14	13:50:14	2025-11-14 11:50:14.141	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-14 13:50:14.142622	2025-11-14 13:50:14.142622	300.00	300.00
67c9affc-ae71-45d0-b9bd-1a1f9761c0fe	KU251114-2597	4198e055-01a1-4e6b-b5a5-ecf2db10e761	53e3741b-51ee-4d66-9f6b-33ecabd8b463	30.00	USD	CASH	PAID	2025-11-14	13:51:33	2025-11-14 11:51:33.606	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-14 13:51:33.642019	2025-11-14 13:51:33.642019	30.00	30.00
53992eab-57fd-4bc8-9626-9a23bb784e5f	KU251114-0889	cc21613a-e018-4958-b1f3-ba046afe9d5e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	120.00	USD	CASH	PAID	2025-11-14	14:44:46	2025-11-14 12:44:46.097	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-14 14:44:46.097801	2025-11-14 14:44:46.097801	120.00	120.00
04f01bb0-5bd4-4029-8431-537cfb6f335b	KU251114-6611	0f639da7-b8ae-4671-a1ce-d66c76169567	02a25259-aec1-4f90-ac51-d302eb267d3a	270.00	USD	CASH	PAID	2025-11-14	15:29:01	2025-11-14 13:29:01.148	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-14 15:29:01.150227	2025-11-14 15:29:01.150227	270.00	270.00
e5a2af85-4ef2-4748-9d95-1a6d4edefdd0	KU251115-4539	580f7ae4-f6fd-4fd4-8a4f-46a53bc3fc36	6204b8eb-b190-4992-ad03-4dbb161cfff2	5000.00	USD	CASH	PAID	2025-11-15	09:21:20	2025-11-15 07:21:20.811	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-15 09:21:20.812659	2025-11-15 09:21:20.812659	5000.00	5000.00
7e10802c-5539-42b3-bac6-eb995c5229ed	KU251115-5032	a8eb6611-3c8e-4b67-a269-68033e418688	53e3741b-51ee-4d66-9f6b-33ecabd8b463	210.00	USD	CASH	PAID	2025-11-15	10:40:11	2025-11-15 08:40:11.383	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-15 10:40:11.3849	2025-11-15 10:40:11.3849	0.00	\N
aabd102d-c8b7-4559-9e81-96a491e80dfd	KU251114-8064	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-14	16:22:08	2025-11-15 08:53:17.961	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-14 16:22:08.766543	2025-11-15 10:53:17.961845	0.00	300.00
3649c526-3e88-4da6-8dfe-a3aef44e42d7	KU251114-4650	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	6204b8eb-b190-4992-ad03-4dbb161cfff2	400.00	USD	CASH	PAID	2025-11-14	16:09:53	2025-11-15 08:53:26.254	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-14 16:09:53.177771	2025-11-15 10:53:26.254492	0.00	400.00
f2fe9b61-1e72-44f6-befa-99c9fe9c9b24	KU251114-4460	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PAID	2025-11-14	13:48:51	2025-11-15 08:53:47.629	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-14 13:48:51.282941	2025-11-15 10:53:47.62978	0.00	2000.00
a4b238e2-604f-41c3-b61c-73660363879d	KU251115-6818	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-15	11:51:51	2025-11-15 09:51:51.359	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-15 11:51:51.402714	2025-11-15 11:51:51.402714	0.00	\N
312151ec-9b18-4018-b088-12b97a04bb9d	KU251115-4732	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	53e3741b-51ee-4d66-9f6b-33ecabd8b463	100.00	USD	CASH	PAID	2025-11-15	11:53:05	2025-11-15 09:53:05.258	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-15 11:53:05.259162	2025-11-15 11:53:05.259162	0.00	\N
faa09bb4-0c1c-480a-9932-c697fc09cfeb	KU251115-0010	e3e44f9d-911b-4d28-b956-f314e9b74fb6	6204b8eb-b190-4992-ad03-4dbb161cfff2	500.00	USD	CASH	PAID	2025-11-15	13:47:32	2025-11-15 11:47:32.675	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-15 13:47:32.677163	2025-11-15 13:47:32.677163	0.00	\N
87bb966c-fcba-4701-b15e-5929213ae027	KU251115-1988	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-15	13:12:29	2025-11-15 11:12:29.106	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	KU251115-1988	2025-11-15 13:18:00.687253	2025-11-15 13:12:29.109062	2025-11-15 13:18:00.687253	0.00	\N
0f853112-d6dc-4836-9848-ad7616733120	KU251115-0011	ee3455fe-2bf7-487c-8e25-e2dc57b63d3d	53e3741b-51ee-4d66-9f6b-33ecabd8b463	800.00	USD	CASH	PAID	2025-11-15	14:10:34	2025-11-15 12:10:34.407	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-15 14:10:34.411003	2025-11-15 14:10:34.411003	0.00	\N
aa6bd1fc-5d47-44a6-ac8b-4aa2dacfd94b	KU251115-0012	1f489418-3102-47b6-9a8c-2db366f37c1a	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-15	14:12:24	2025-11-15 12:12:24.146	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-15 14:12:24.147437	2025-11-15 14:12:24.147437	0.00	\N
98a664eb-f08e-4c6d-8f7b-2033ca1f569b	KU251114-9610	dba747bc-6b58-44b5-9c5a-88376604bf41	53e3741b-51ee-4d66-9f6b-33ecabd8b463	700.00	USD	CASH	PAID	2025-11-14	16:04:45	2025-11-15 12:43:11.128	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-14 16:04:45.259793	2025-11-15 14:43:11.129079	0.00	700.00
7f245215-116b-4125-aa6f-d6eaca760cea	KU251115-0013	4700bec5-6fb9-4f8e-ad4e-6b09f81df49a	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-11-15	14:33:21	2025-11-15 13:16:14.47	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-15 14:33:21.690378	2025-11-15 15:16:14.471648	0.00	\N
952ac9a0-7333-4b85-80b0-f323bdbf685d	KU251116-0002	568324bd-0670-46b0-a448-49986d773d95	6204b8eb-b190-4992-ad03-4dbb161cfff2	300.00	USD	CASH	PAID	2025-11-16	09:12:25	2025-11-17 09:11:42.152	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-16 09:12:25.721079	2025-11-17 11:11:42.152162	0.00	\N
43af2a7a-6e72-4fd4-b6ff-630ba7329be9	KU251115-0016	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	900.00	USD	CASH	PAID	2025-11-15	14:46:35	2025-11-17 09:12:05.485	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-15 14:46:35.150804	2025-11-17 11:12:05.486146	0.00	\N
71270828-9b9d-46ea-b37d-f28d5d43e835	KU251115-0015	dba747bc-6b58-44b5-9c5a-88376604bf41	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-15	14:43:30	2025-11-17 09:12:16.555	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-15 14:43:30.166759	2025-11-17 11:12:16.555844	0.00	\N
fe3887db-f93e-4eda-b280-5cce785ce132	KU251115-0009	9f5aed3b-a66e-4b40-acae-7a21ced33164	6204b8eb-b190-4992-ad03-4dbb161cfff2	500.00	USD	CASH	PAID	2025-11-15	13:47:02	2025-11-17 09:12:34.726	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-15 13:47:02.447403	2025-11-17 11:12:34.726849	0.00	\N
c45dd169-2ff5-46d1-826e-655fdc618b3b	KU251115-0337	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-15	13:18:20	2025-11-17 09:12:48.501	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-15 13:18:20.76078	2025-11-17 11:12:48.501631	0.00	\N
218e3962-0a3b-4c6e-aa75-8c1fe950b620	KU251115-8831	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-15	10:36:07	2025-11-17 09:13:30.894	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-15 10:36:07.58382	2025-11-17 11:13:30.894965	0.00	\N
7ced2e17-6173-4e5d-8cf0-6fce556f0a67	KU251114-3264	f3d21b8c-c1d8-415f-ab1e-6307eb765b77	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1500.00	USD	CASH	PAID	2025-11-14	14:32:58	2025-11-17 09:19:22.972	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-14 14:32:58.155443	2025-11-17 11:19:22.972649	0.00	1500.00
89a78680-e9ba-4801-b5c6-361a394c7462	KU251115-7709	8e34184e-2091-4691-a5dc-329a22d316e9	53e3741b-51ee-4d66-9f6b-33ecabd8b463	250.00	USD	CASH	PAID	2025-11-15	09:17:51	2025-11-17 12:16:58.853	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-15 09:17:51.180718	2025-11-17 14:16:58.853378	0.00	250.00
d6184af7-61c0-4698-8b32-754b54db4bd5	KU251115-0014	211317cb-7002-4abc-8350-ea60cd33dcd7	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-15	14:40:08	2025-11-20 09:38:23.676	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-15 14:40:08.63941	2025-11-20 11:38:23.676849	0.00	\N
02f8f732-dc1a-4cc2-a436-1cac385de871	KU251116-0001	580f7ae4-f6fd-4fd4-8a4f-46a53bc3fc36	6204b8eb-b190-4992-ad03-4dbb161cfff2	1000.00	USD	CASH	PAID	2025-11-16	09:11:53	2025-11-16 08:48:36.67	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-16 09:11:53.106746	2025-11-16 10:48:36.67097	0.00	\N
c6c540c9-f00e-4518-a294-820bb598b9af	KU251124-0004	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-11-24	12:11:56	2025-11-24 10:11:56.101	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-24 12:11:56.118606	2025-11-24 12:11:56.118606	0.00	\N
57c5ea91-9f3f-4556-b1f7-1cb67510f446	KU251117-0003	d9fedfe6-0d89-49fe-b06c-97529354a88c	6204b8eb-b190-4992-ad03-4dbb161cfff2	500.00	USD	CASH	PAID	2025-11-17	10:12:36	2025-11-17 08:12:36.68	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-17 10:12:36.681525	2025-11-17 10:12:36.681525	0.00	\N
eff1201d-1273-41ee-9738-e8e4bef99dec	KU251117-0004	bd7c75e3-931e-48e2-9da1-7e0655e8299b	53e3741b-51ee-4d66-9f6b-33ecabd8b463	800.00	USD	CASH	PAID	2025-11-17	10:33:56	2025-11-17 08:33:56.253	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-17 10:33:56.25442	2025-11-17 10:33:56.25442	0.00	\N
588c50ae-2df9-4a2c-8c81-22a1a646e6e4	KU251117-0005	2b89c467-e4b0-419f-9ade-f42a777264db	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-17	10:35:45	2025-11-17 08:35:45.055	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-17 10:35:45.056308	2025-11-17 10:35:45.056308	0.00	\N
43099cac-5de5-42ce-bd54-b9a8729f3a6c	KU251117-0001	7627a189-2adf-4bea-8bb0-dcd113b9c865	6204b8eb-b190-4992-ad03-4dbb161cfff2	1000.00	USD	CASH	PAID	2025-11-17	10:11:56	2025-11-17 09:11:21.89	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-17 10:11:56.140433	2025-11-17 11:11:21.890658	0.00	\N
7f26d0b5-2475-49d7-bb67-9d68b545d236	KU251116-0003	7627a189-2adf-4bea-8bb0-dcd113b9c865	6204b8eb-b190-4992-ad03-4dbb161cfff2	2000.00	USD	CASH	PAID	2025-11-16	10:55:00	2025-11-17 09:11:32.746	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-16 10:55:00.342692	2025-11-17 11:11:32.746199	0.00	\N
891ed417-302f-43b5-83fc-50bbd8ab8e05	KU251117-0006	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-17	11:29:47	2025-11-17 09:29:47.717	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-17 11:29:47.741642	2025-11-17 11:29:47.741642	0.00	\N
450ec151-270e-4ea4-afd2-6c8388d15383	KU251117-0009	acd822cd-9ce5-46e1-9a40-917c1ef63a27	53e3741b-51ee-4d66-9f6b-33ecabd8b463	120.00	USD	CASH	PAID	2025-11-17	12:37:31	2025-11-17 10:37:31.555	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-17 12:37:31.556426	2025-11-17 12:37:31.556426	0.00	\N
f0da7594-25b1-4ce9-857e-52c82d240c01	KU251117-0014	8e34184e-2091-4691-a5dc-329a22d316e9	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-17	14:11:31	2025-11-17 12:11:31.681	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-17 14:11:31.682305	2025-11-17 14:11:31.682305	0.00	\N
3f4e1b3e-dbe7-4ec2-98d1-1af8c6309b1a	KU251117-0016	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	02a25259-aec1-4f90-ac51-d302eb267d3a	800.00	USD	CASH	PAID	2025-11-17	15:13:29	2025-11-17 13:13:29.509	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-17 15:13:29.510474	2025-11-17 15:13:29.510474	0.00	\N
2a436746-aaf8-455d-8808-2cafd650993a	KU251118-0001	9f7b27a4-b866-4e8f-9138-c385cf2b4f0c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-18	08:48:08	2025-11-18 06:48:08.415	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-18 08:48:08.41662	2025-11-18 08:48:08.41662	0.00	\N
e50581f7-2aea-43ca-90f1-3842ebd8455e	KU251117-0018	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	600.00	USD	CASH	PAID	2025-11-17	15:43:28	2025-11-18 07:04:56.976	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-17 15:43:28.658871	2025-11-18 09:04:56.977011	0.00	\N
6a2b7336-ee68-43b5-99b5-c65edbde5c09	KU251117-0017	c21e9a75-8949-49c2-b2c9-ff6c316fae26	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-17	15:41:50	2025-11-18 07:05:08.143	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-17 15:41:50.442362	2025-11-18 09:05:08.143586	0.00	\N
46eb9309-47a0-4a9a-bcdf-3d16ecdb62f1	KU251117-0015	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	700.00	USD	CASH	PAID	2025-11-17	14:17:43	2025-11-18 07:05:17.148	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-17 14:17:43.09881	2025-11-18 09:05:17.148943	0.00	\N
dd15560a-5a7d-4706-9a9b-24c5f1468566	KU251117-0013	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-17	14:08:55	2025-11-18 07:05:27.589	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-17 14:08:55.434563	2025-11-18 09:05:27.589202	0.00	\N
6391fd51-054b-45cb-8e67-3318470da21d	KU251117-0011	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-17	13:05:21	2025-11-18 07:05:48.176	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-17 13:05:21.648505	2025-11-18 09:05:48.177237	0.00	\N
36bcdf91-3192-4b95-abbf-4b45bcbf3e09	KU251117-0010	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2400.00	USD	CASH	PAID	2025-11-17	12:59:05	2025-11-18 07:05:56.986	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-17 12:59:05.322144	2025-11-18 09:05:56.987003	0.00	\N
b9a99a36-2d2a-4376-a18c-c744a0d27174	KU251117-0008	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-17	11:39:05	2025-11-18 07:06:07.947	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-17 11:39:05.095904	2025-11-18 09:06:07.947606	0.00	\N
e64ad6fd-c592-4d63-8d50-ec3b31528250	KU251118-0002	dc685389-b46b-488f-b903-fc8d4743043b	53e3741b-51ee-4d66-9f6b-33ecabd8b463	5000.00	USD	BANK TRANSFER	PAID	2025-11-18	09:01:46	2025-11-18 07:55:09.635	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-18 09:01:46.973349	2025-11-18 09:55:09.635961	0.00	\N
159fb0f2-3faa-4364-bd91-b50c7827c936	KU251118-0003	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-18	10:05:25	2025-11-18 08:05:25.076	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-18 10:05:25.079217	2025-11-18 10:05:25.079217	0.00	\N
60835e82-6e75-4498-9295-b85a7fda5efd	KU251117-0012	3aefd7d8-f08a-40f7-a105-c2d0d15b1083	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-17	13:48:21	2025-11-18 08:07:33.064	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-17 13:48:21.067522	2025-11-18 10:07:33.064804	0.00	\N
6800ac4c-3c42-4e6e-96ec-cd60db203851	KU251118-0004	3aefd7d8-f08a-40f7-a105-c2d0d15b1083	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-18	10:08:03	2025-11-18 08:08:03.39	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-18 10:08:03.391005	2025-11-18 10:08:03.391005	0.00	\N
3aed37ad-28d2-4b10-82b6-19b39e328462	KU251118-0007	e21cbb1d-137a-4ed8-b5e4-00e828e9f278	53e3741b-51ee-4d66-9f6b-33ecabd8b463	17095.00	USD	CASH	PAID	2025-11-18	10:46:58	2025-11-18 08:46:58.307	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	KU251118-0004\n	2025-11-18 10:47:19.912915	2025-11-18 10:46:58.309931	2025-11-18 10:47:19.912915	0.00	\N
6607e475-1d0c-4789-aa5a-b40bd33b1c99	KU251118-0008	e21cbb1d-137a-4ed8-b5e4-00e828e9f278	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1795.00	USD	CASH	PAID	2025-11-18	10:47:34	2025-11-18 08:47:34.242	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-18 10:47:34.243195	2025-11-18 10:47:34.243195	0.00	\N
157dfbe3-3e12-4526-8080-d4823a90ca2e	KU251118-0009	2b89c467-e4b0-419f-9ade-f42a777264db	53e3741b-51ee-4d66-9f6b-33ecabd8b463	350.00	USD	CASH	PAID	2025-11-18	11:06:46	2025-11-18 09:06:46.294	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-18 11:06:46.296176	2025-11-18 11:06:46.296176	0.00	\N
b33dc60c-f9d8-48d9-b558-39eb1121840c	KU251118-0010	ee3455fe-2bf7-487c-8e25-e2dc57b63d3d	53e3741b-51ee-4d66-9f6b-33ecabd8b463	900.00	USD	CASH	PAID	2025-11-18	11:13:29	2025-11-18 09:13:29.958	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-18 11:13:29.959648	2025-11-18 11:13:29.959648	0.00	\N
a65299e0-2fae-4c36-8aa5-34a28cb5b0bc	KU251118-0011	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	260.00	USD	CASH	PAID	2025-11-18	11:45:03	2025-11-18 09:45:03.21	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-18 11:45:03.22161	2025-11-18 11:45:03.22161	0.00	\N
0a984ad6-0515-49a7-883e-1041ffaa6533	KU251118-0012	d9fedfe6-0d89-49fe-b06c-97529354a88c	02a25259-aec1-4f90-ac51-d302eb267d3a	500.00	USD	CASH	PAID	2025-11-18	12:21:07	2025-11-18 10:21:07.626	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-18 12:21:07.642481	2025-11-18 12:21:07.642481	0.00	\N
ae6906db-8574-4763-a14a-d8dfa3fa9a4f	KU251118-0013	48c75540-955e-4fa8-a024-b61780e4e248	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-18	12:42:35	2025-11-18 10:42:35.729	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-18 12:42:35.738526	2025-11-18 12:42:35.738526	0.00	\N
81c62b43-cc0a-409e-9032-5c7994eba4c0	KU251118-0014	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	800.00	USD	CASH	PAID	2025-11-18	14:07:15	2025-11-18 12:07:15.77	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-18 14:07:15.77792	2025-11-18 14:07:15.77792	0.00	\N
cd52bd6a-53ae-4deb-ae59-7d4d9364d9f5	KU251118-0016	7136d6c5-245b-421b-9bbb-84c637cf1577	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1400.00	USD	CASH	PAID	2025-11-18	14:23:33	2025-11-18 12:23:33.631	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-18 14:23:33.633273	2025-11-18 14:23:33.633273	0.00	\N
4cb4e086-f4b3-4c2c-aa01-e4a0c9e07736	KU251118-0018	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	53e3741b-51ee-4d66-9f6b-33ecabd8b463	600.00	USD	CASH	PAID	2025-11-18	15:14:15	2025-11-18 13:14:15.01	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-18 15:14:15.028131	2025-11-18 15:14:15.028131	0.00	\N
7641eb5c-9743-495b-8648-e1af98db1722	KU251118-0006	dba747bc-6b58-44b5-9c5a-88376604bf41	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-11-18	10:36:49	2025-11-19 09:50:14.209	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-18 10:36:49.884203	2025-11-19 11:50:14.209565	0.00	\N
8f784abd-2950-4474-bbed-afedda97000f	KU251118-0005	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-11-18	10:21:57	2025-11-19 09:50:21.144	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-18 10:21:57.683737	2025-11-19 11:50:21.144278	0.00	\N
a64ee0ad-4435-4305-9842-fcc1c5b5adc1	KU251118-0015	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-18	14:08:29	2025-11-20 10:04:00.232	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-18 14:08:29.878974	2025-11-20 12:04:00.232455	0.00	\N
5a024794-b2ec-4a9a-b1e3-9b3de49dcef0	KU251119-0001	f30f98e4-41c2-44e3-8fcd-0c8643df76d1	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-19	09:52:47	2025-11-19 07:52:47.478	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-19 09:52:47.51132	2025-11-19 09:52:47.51132	0.00	\N
102c3f97-788f-4666-8851-448df1cb3c93	KU251118-0017	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PAID	2025-11-18	14:46:09	2025-11-19 09:49:59.843	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-18 14:46:09.292244	2025-11-19 11:49:59.843204	0.00	\N
d88cabba-1491-4497-9f13-0b72111e1b0d	KU251124-0008	d9fedfe6-0d89-49fe-b06c-97529354a88c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-24	17:40:36	2025-11-24 15:40:36.471	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-24 17:40:36.472441	2025-11-24 17:40:36.472441	0.00	\N
957328bd-e92b-4625-96d5-3d2e3d5f6b62	KU251119-0004	3aefd7d8-f08a-40f7-a105-c2d0d15b1083	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-19	14:21:13	2025-11-19 12:21:13.184	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-19 14:21:13.184696	2025-11-19 14:21:13.184696	0.00	\N
ef46ba0e-fabf-4f59-b5a0-32cc61899bd1	KU251119-0005	92988962-c192-4f5c-8cdc-a0d063110479	53e3741b-51ee-4d66-9f6b-33ecabd8b463	150.00	USD	CASH	PAID	2025-11-19	14:22:50	2025-11-19 12:22:50.957	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-19 14:22:50.957899	2025-11-19 14:22:50.957899	0.00	\N
6b1d3ae1-8fc7-4ccf-bd64-69e17ee2b60b	KU251119-0003	d9fedfe6-0d89-49fe-b06c-97529354a88c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-19	14:18:11	2025-11-19 12:24:14.951	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-19 14:18:11.773499	2025-11-19 14:24:14.952104	0.00	\N
30f1a0c2-7a5b-4581-b00c-66746450293f	KU251121-0009	86b93c70-e8e1-4bce-8182-c626b082b8bf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	10000.00	USD	CASH	PAID	2025-11-21	13:35:40	2025-11-26 08:39:41.404	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-21 13:35:40.267157	2025-11-26 10:39:41.404369	0.00	\N
34b9e3e9-8e8e-4815-a014-8c8a8e157295	KU251119-0007	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-19	15:05:33	2025-11-19 13:05:33.149	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-19 15:05:33.151616	2025-11-19 15:05:33.151616	0.00	\N
77e877f9-6254-45e1-b560-c8596eca9ce2	KU251119-0008	211317cb-7002-4abc-8350-ea60cd33dcd7	53e3741b-51ee-4d66-9f6b-33ecabd8b463	100.00	USD	CASH	PAID	2025-11-19	15:16:14	2025-11-19 13:16:14.192	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-19 15:16:14.193777	2025-11-19 15:16:14.193777	0.00	\N
256cbed3-7bc1-41f7-9d60-3a0cfeb204a6	KU251120-0004	8e34184e-2091-4691-a5dc-329a22d316e9	6204b8eb-b190-4992-ad03-4dbb161cfff2	100.00	USD	CASH	PAID	2025-11-20	09:26:58	2025-11-27 07:03:42.307	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-20 09:26:58.272232	2025-11-27 09:03:42.307912	0.00	\N
696064a5-3874-4c02-a552-90c5c925bdfb	KU251121-0006	f3d21b8c-c1d8-415f-ab1e-6307eb765b77	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1500.00	USD	CASH	PAID	2025-11-21	10:15:49	2025-11-27 08:25:50.499	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-21 10:15:49.53723	2025-11-27 10:25:50.49926	0.00	\N
894fe02e-4bdc-40f9-9968-c26c9c42d80b	KU251114-6101	970181ef-e333-4707-b74c-f6818f947fd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2700.00	USD	CASH	PAID	2025-11-14	13:02:19	2025-11-28 11:32:54.447	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-14 13:02:19.500812	2025-11-28 13:32:54.448159	2200.00	500.00
2c7792d6-83d8-4122-9347-a638fe028b84	KU251119-0009	970181ef-e333-4707-b74c-f6818f947fd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-19	16:39:11	2025-11-28 11:33:05.161	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-19 16:39:11.658087	2025-11-28 13:33:05.162	0.00	\N
f1007e2a-8b95-4c23-905f-829c582bc661	KU251121-0012	92988962-c192-4f5c-8cdc-a0d063110479	53e3741b-51ee-4d66-9f6b-33ecabd8b463	50.00	USD	CASH	PAID	2025-11-21	14:07:22	2025-12-01 12:06:53.248	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-21 14:07:22.060941	2025-12-01 14:06:53.248945	0.00	\N
840afb8d-74dc-449c-b3c1-ccc50c13aae3	KU251120-0007	0f639da7-b8ae-4671-a1ce-d66c76169567	53e3741b-51ee-4d66-9f6b-33ecabd8b463	180.00	USD	CASH	PAID	2025-11-20	11:50:54	2025-11-20 09:50:54.384	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-20 11:50:54.387118	2025-11-20 11:50:54.387118	0.00	\N
72d43f64-6a21-4352-a791-f35c04b093b8	KU251120-0008	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1330.00	USD	CASH	PAID	2025-11-20	12:05:30	2025-11-20 10:05:30.862	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-20 12:05:30.877041	2025-11-20 12:05:30.877041	0.00	\N
ec64b213-6b77-480c-9e7e-2853670b87fa	KU251120-0009	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-20	13:07:51	2025-11-20 11:07:51.32	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-20 13:07:51.334581	2025-11-20 13:07:51.334581	0.00	\N
d47277cb-25fe-44f6-b5e7-dfa3360aa9bd	KU251119-0002	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-19	13:19:30	2025-11-20 11:14:07.437	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-19 13:19:30.564784	2025-11-20 13:14:07.437756	0.00	\N
29f09b6f-6ddb-458a-870a-4d4080eca0f3	KU251119-0006	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2100.00	USD	CASH	PAID	2025-11-19	14:37:14	2025-11-20 11:14:15.221	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-19 14:37:14.16984	2025-11-20 13:14:15.221463	0.00	\N
e1c4390b-ab1a-4184-8809-b02b5b45a923	KU251120-0010	d9fedfe6-0d89-49fe-b06c-97529354a88c	02a25259-aec1-4f90-ac51-d302eb267d3a	500.00	USD	CASH	PAID	2025-11-20	14:40:52	2025-11-20 12:40:52.508	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-20 14:40:52.510492	2025-11-20 14:40:52.510492	0.00	\N
be99e258-379a-4a87-b338-4cffc31cc384	KU251120-0011	1f489418-3102-47b6-9a8c-2db366f37c1a	02a25259-aec1-4f90-ac51-d302eb267d3a	400.00	USD	CASH	PAID	2025-11-20	15:04:23	2025-11-20 13:04:23.071	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-20 15:04:23.085629	2025-11-20 15:04:23.085629	0.00	\N
4a00a9a6-7601-4c10-a323-1d4306add0f5	KU251120-0012	3276bf6c-e1cc-4791-9e0d-44d6a9966ba4	6204b8eb-b190-4992-ad03-4dbb161cfff2	250.00	USD	CASH	PAID	2025-11-20	15:45:56	2025-11-20 13:45:56.44	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-20 15:45:56.481288	2025-11-20 15:45:56.481288	0.00	\N
651c65f2-eec0-4f91-a28b-73d7e132a911	KU251120-0013	7627a189-2adf-4bea-8bb0-dcd113b9c865	6204b8eb-b190-4992-ad03-4dbb161cfff2	2000.00	USD	CASH	PAID	2025-11-20	16:21:31	2025-11-21 07:32:36.08	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-20 16:21:31.748908	2025-11-21 09:32:36.080656	0.00	\N
63b6295e-32ec-481c-a708-da6be0520770	KU251120-0005	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	6204b8eb-b190-4992-ad03-4dbb161cfff2	900.00	USD	CASH	PAID	2025-11-20	09:27:54	2025-11-21 07:32:56.806	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-20 09:27:54.131927	2025-11-21 09:32:56.806345	0.00	\N
382becd5-d5e3-46e7-bbcb-7e74a92c5657	KU251120-0006	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2100.00	USD	CASH	PAID	2025-11-20	11:00:06	2025-11-21 07:33:10.963	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-20 11:00:06.98306	2025-11-21 09:33:10.964222	0.00	\N
68eb8451-09da-46fb-8628-2f1c0fe82f91	KU251121-0001	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2700.00	USD	CASH	PAID	2025-11-21	09:34:13	2025-11-21 07:34:13.802	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-21 09:34:13.81327	2025-11-21 09:34:13.81327	0.00	\N
67b2f909-8196-4b45-b274-413645213341	KU251120-0001	6bbc4e6f-aac0-43fc-8235-82d517012bba	6204b8eb-b190-4992-ad03-4dbb161cfff2	1300.00	USD	CASH	PAID	2025-11-20	08:43:46	2025-11-21 07:36:27.213	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-20 08:43:46.076965	2025-11-21 09:36:27.21354	0.00	\N
82b0772a-0dfc-46cc-8a0d-fb9bc5063a6a	KU251120-0002	568324bd-0670-46b0-a448-49986d773d95	6204b8eb-b190-4992-ad03-4dbb161cfff2	400.00	USD	CASH	PAID	2025-11-20	08:45:58	2025-11-21 07:36:34.144	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-20 08:45:58.840502	2025-11-21 09:36:34.144637	0.00	\N
24289df3-9c6a-4afa-a09f-b224ff2c2881	KU251120-0003	8e34184e-2091-4691-a5dc-329a22d316e9	6204b8eb-b190-4992-ad03-4dbb161cfff2	150.00	USD	CASH	PAID	2025-11-20	08:47:00	2025-11-21 07:36:43.822	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-20 08:47:00.551381	2025-11-21 09:36:43.822869	0.00	\N
2bf2daf2-bade-4bd2-b317-6035fcec806b	KU251121-0003	f828c186-489b-482f-825d-346415a7d840	53e3741b-51ee-4d66-9f6b-33ecabd8b463	450.00	USD	CASH	PAID	2025-11-21	09:46:41	2025-11-21 07:46:41.729	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-21 09:46:41.742866	2025-11-21 09:46:41.742866	0.00	\N
a0b90b70-a8ab-4d45-9275-7e078867c198	KU251121-0004	60fb4144-ba84-48b6-940c-b5fb58bd0ee7	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PAID	2025-11-21	09:48:21	2025-11-21 07:48:21.269	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-21 09:48:21.270688	2025-11-21 09:48:21.270688	0.00	\N
4aad93dc-939d-4dce-990e-510926621c51	KU251117-0002	f3d21b8c-c1d8-415f-ab1e-6307eb765b77	6204b8eb-b190-4992-ad03-4dbb161cfff2	1000.00	USD	CASH	PAID	2025-11-17	10:12:21	2025-11-21 07:53:58.989	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-17 10:12:21.60026	2025-11-21 09:53:58.989187	0.00	\N
4be83b7a-0c5f-4298-85a8-c9575ce97f2d	KU251121-0007	d9fedfe6-0d89-49fe-b06c-97529354a88c	02a25259-aec1-4f90-ac51-d302eb267d3a	1000.00	USD	CASH	PAID	2025-11-21	10:43:01	2025-11-21 08:43:01.849	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-21 10:43:01.857291	2025-11-21 10:43:01.857291	0.00	\N
df749304-570a-4aad-a65a-dbd02e707eec	KU251121-0008	ee3455fe-2bf7-487c-8e25-e2dc57b63d3d	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-21	11:45:11	2025-11-21 09:45:11.708	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-21 11:45:11.712495	2025-11-21 11:45:11.712495	0.00	\N
0b2c8e18-fba9-4858-9864-e22256f43486	KU251121-0011	a638a2b5-611b-4b72-90df-911f4c9f823e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-21	13:47:28	2025-11-21 11:47:28.829	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-21 13:47:28.831251	2025-11-21 13:47:28.831251	0.00	\N
40932cd2-8b66-40ed-a2fd-bd95c77066a9	KU251121-0005	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-21	09:50:24	2025-11-24 08:00:45.655	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-21 09:50:24.853344	2025-11-24 10:00:45.655832	0.00	\N
fe86b6a9-2c25-47c6-aee6-0748568fb3cb	KU251121-0002	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	940.00	USD	CASH	PAID	2025-11-21	09:36:03	2025-11-24 08:01:24.558	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-21 09:36:03.737363	2025-11-24 10:01:24.558652	0.00	\N
1efd9d73-2a25-4bb0-9bdb-ee97d1e047c3	KU251121-0013	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2200.00	USD	CASH	PAID	2025-11-21	14:22:09	2025-11-21 12:22:09.307	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-21 14:22:09.308557	2025-11-21 14:22:09.308557	0.00	\N
2cadbcb1-919d-4c94-953b-d68dabad4743	KU251121-0015	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-21	14:49:49	2025-11-24 08:11:05.872	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-21 14:49:49.615179	2025-11-24 10:11:05.873032	0.00	\N
a86cfeb1-5881-41dd-b73d-c36adc92740f	KU251121-0016	93da34c6-b76f-48e7-a2c1-57de6b2082fa	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-21	15:36:59	2025-11-21 13:36:59.46	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-21 15:36:59.463369	2025-11-21 15:36:59.463369	0.00	\N
16e4de8b-8848-4840-b7ee-1dc5c81da421	KU251121-0018	e21cbb1d-137a-4ed8-b5e4-00e828e9f278	53e3741b-51ee-4d66-9f6b-33ecabd8b463	840.00	USD	CASH	PAID	2025-11-21	16:49:41	2025-11-21 14:49:41.203	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-21 16:49:41.204241	2025-11-21 16:49:41.204241	0.00	\N
8f449648-b00e-40ea-a6ef-9b41233b468a	KU251123-0005	9f7b27a4-b866-4e8f-9138-c385cf2b4f0c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	900.00	USD	CASH	PAID	2025-11-23	15:00:43	2025-11-24 08:16:43.063	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-23 15:00:43.127742	2025-11-24 10:16:43.063468	0.00	\N
10e7ed57-f9da-4e6a-b4bf-377322a5c51f	KU251122-0001	e3e44f9d-911b-4d28-b956-f314e9b74fb6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-22	13:44:28	2025-11-22 11:44:28.362	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-22 13:44:28.378654	2025-11-22 13:44:28.378654	0.00	\N
c1770819-1547-49db-89b4-93ed9170a6c9	KU251122-0002	3aefd7d8-f08a-40f7-a105-c2d0d15b1083	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-22	13:45:00	2025-11-22 11:45:00.061	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-22 13:45:00.062699	2025-11-22 13:45:00.062699	0.00	\N
cafe233d-3110-42a2-940b-c3f7aa81a348	KU251122-0009	e9457736-1c31-4b00-a9ed-c888aca31f2e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	450.00	USD	CASH	PAID	2025-11-22	13:49:39	2025-11-22 11:49:39.401	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-22 13:49:39.403356	2025-11-22 13:49:39.403356	0.00	\N
47ac2433-82ca-4823-9eec-a0b6bbef43f3	KU251122-0012	f828c186-489b-482f-825d-346415a7d840	53e3741b-51ee-4d66-9f6b-33ecabd8b463	550.00	USD	CASH	PAID	2025-11-22	15:03:36	2025-11-22 13:03:36.296	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-22 15:03:36.306267	2025-11-22 15:03:36.306267	0.00	\N
b74ad6c5-310b-4a40-a2c8-2d1c9b242f7a	KU251121-0019	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-21	16:50:48	2025-11-24 07:59:19.82	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-21 16:50:48.734674	2025-11-24 09:59:19.820653	0.00	\N
bfecf96a-d133-41bb-81b8-643b2a819017	KU251121-0014	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-21	14:46:57	2025-11-24 08:00:05.93	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-21 14:46:57.174343	2025-11-24 10:00:05.930327	0.00	\N
5a483a42-6738-46a6-ba68-7f28f2df2eb5	KU251121-0010	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-11-21	13:37:28	2025-11-24 08:00:26.806	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-21 13:37:28.514822	2025-11-24 10:00:26.806618	0.00	\N
10be6f1c-4253-4b39-916a-bb5a0a62734f	KU251123-0004	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-23	12:59:48	2025-11-24 08:16:48.362	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-23 12:59:48.466111	2025-11-24 10:16:48.363146	0.00	\N
f6c48e45-b7e4-4fb8-b857-5fb5485ae08d	KU251123-0001	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-11-23	11:53:08	2025-11-24 08:17:46.789	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-23 11:53:08.7409	2025-11-24 10:17:46.789685	0.00	\N
bd2080f2-d3a6-4abc-974c-5e5405f4a4b9	KU251122-0004	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-22	13:46:22	2025-11-24 08:45:16.921	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-22 13:46:22.770822	2025-11-24 10:45:16.92214	0.00	\N
71aa4009-6ac3-497f-8bfa-b53b1f853056	KU251122-0005	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-11-22	13:46:53	2025-11-24 08:45:51.106	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-22 13:46:53.859873	2025-11-24 10:45:51.106822	0.00	\N
fb36cc68-fb2c-41c4-98d1-155aba69cdb3	KU251122-0006	c4629f98-e943-497b-9f67-00e7237ebf0a	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-22	13:47:17	2025-11-24 08:46:00.066	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-22 13:47:17.229916	2025-11-24 10:46:00.067047	0.00	\N
8d0c7807-09d3-441b-a041-82d777435e9c	KU251122-0008	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1400.00	USD	CASH	PAID	2025-11-22	13:48:14	2025-11-24 08:46:28.465	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-22 13:48:14.291226	2025-11-24 10:46:28.465636	0.00	\N
5bfce0ef-af92-4d60-aae1-6b6c88439c2a	KU251122-0011	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-11-22	14:50:53	2025-11-24 08:46:41.942	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-22 14:50:53.440511	2025-11-24 10:46:41.942493	0.00	\N
d903194d-3c66-4009-a8d4-db9f8aeac596	KU251122-0003	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-22	13:45:38	2025-11-24 10:11:30.132	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-22 13:45:38.509569	2025-11-24 12:11:30.133003	0.00	\N
0be416e9-d4b0-40f2-90ab-301c497ec248	KU251123-0002	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-23	11:53:51	2025-11-24 13:35:24.916	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-23 11:53:51.23238	2025-11-24 15:35:24.916401	0.00	\N
bc07616e-8605-4bc9-b34c-33e5b9330b4c	KU251124-0006	93da34c6-b76f-48e7-a2c1-57de6b2082fa	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-11-24	17:38:25	2025-11-24 15:38:25.676	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	duplicate	2025-11-24 17:39:43.261164	2025-11-24 17:38:25.677618	2025-11-24 17:39:43.261164	0.00	\N
e5b12121-2ae1-48d8-b273-d7d3993d50f0	KU251124-0009	8264a667-ae81-48b9-84fd-d795f170737c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-24	17:41:17	2025-11-24 15:41:17.004	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-24 17:41:17.005431	2025-11-24 17:41:17.005431	0.00	\N
e90f476e-1cea-4126-8c08-d47677ed05dc	KU251124-0015	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-24	17:55:14	2025-11-24 15:55:14.11	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-24 17:55:14.112165	2025-11-24 17:55:14.112165	0.00	\N
e4d330bc-8d7f-4a49-ba20-0ff9fc2d302a	KU251120-0014	1602c2a5-5908-4cbf-b14a-73d18ffafbd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-20	16:58:50	2025-11-25 06:45:48.873	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-20 16:58:50.217124	2025-11-25 08:45:48.873308	0.00	\N
3b2d57f6-aee3-4019-86f0-4ec357eff271	KU251125-0004	538a8168-7ee7-4aa4-9697-ba3270729306	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-11-25	09:47:27	2025-11-25 07:47:27.649	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-25 09:47:27.657236	2025-11-25 09:47:27.657236	0.00	\N
4eae9446-08fb-4dce-b959-90c8752fa9f3	KU251125-0006	bd7755a6-ba4f-474c-a854-5857acb022a3	53e3741b-51ee-4d66-9f6b-33ecabd8b463	150.00	USD	CASH	PAID	2025-11-25	09:54:19	2025-11-25 07:54:19.11	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-25 09:54:19.111508	2025-11-25 09:54:19.111508	0.00	\N
cd23a08f-2feb-4539-8728-d6ea8dba0316	KU251125-0002	d9fedfe6-0d89-49fe-b06c-97529354a88c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-11-25	08:37:21	2025-11-25 07:57:37.396	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-25 08:37:21.079874	2025-11-25 09:57:37.397058	0.00	\N
8d4cf02b-5d67-473a-b208-9f783748ac0a	KU251125-0008	f925cb0f-5b64-4efa-aa01-f58f2aa7b5f1	6204b8eb-b190-4992-ad03-4dbb161cfff2	300.00	USD	CASH	PAID	2025-11-25	10:28:56	2025-11-25 08:28:56.192	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-25 10:28:56.193488	2025-11-25 10:28:56.193488	0.00	\N
6ddb990e-36ae-4579-966f-8a5eb4aa0e10	KU251125-0010	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-25	11:17:17	2025-11-25 09:17:17.888	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-25 11:17:17.891297	2025-11-25 11:17:17.891297	0.00	\N
f1d9212d-56fe-4a85-a745-ae8d628f6014	KU251124-0013	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PAID	2025-11-24	17:42:55	2025-11-25 11:32:09.073	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-24 17:42:55.289135	2025-11-25 13:32:09.073182	0.00	\N
4fed6976-923f-46ee-8702-07c1aefe3d1d	KU251124-0011	6bbc4e6f-aac0-43fc-8235-82d517012bba	53e3741b-51ee-4d66-9f6b-33ecabd8b463	900.00	USD	CASH	PAID	2025-11-24	17:41:54	2025-11-25 11:32:19.432	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-24 17:41:54.020407	2025-11-25 13:32:19.432351	0.00	\N
6887a8e0-33eb-49e9-baa9-b3c7d0ecb98f	KU251124-0001	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-24	09:49:07	2025-11-25 11:32:52.334	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-24 09:49:08.024589	2025-11-25 13:32:52.334481	0.00	\N
114b4ea3-7e62-4330-8e6e-0f711e3d67bb	KU251122-0010	f3d21b8c-c1d8-415f-ab1e-6307eb765b77	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1500.00	USD	CASH	PAID	2025-11-22	14:19:38	2025-11-27 08:25:18.315	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-22 14:19:38.581308	2025-11-27 10:25:18.315276	0.00	\N
34bd5faf-5f45-4108-b186-0731a15c1e82	KU251121-0017	4700bec5-6fb9-4f8e-ad4e-6b09f81df49a	53e3741b-51ee-4d66-9f6b-33ecabd8b463	3000.00	USD	CASH	PAID	2025-11-21	16:47:41	2025-11-29 13:27:48.926	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-21 16:47:41.82017	2025-11-29 15:27:48.927041	0.00	\N
d078d76b-3650-4f22-aa09-6c004469f007	KU251122-0007	3aefd7d8-f08a-40f7-a105-c2d0d15b1083	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-22	13:47:46	2025-12-06 09:37:55.11	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-22 13:47:46.209602	2025-12-06 11:37:55.110917	0.00	\N
8d49ff6a-f819-45a0-a91f-4646ecfb3d04	KU251126-0008	f828c186-489b-482f-825d-346415a7d840	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-26	13:04:14	2025-11-26 11:04:14.226	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-26 13:04:14.227561	2025-11-26 13:04:14.227561	0.00	\N
b559b894-9f30-46f6-aa7f-f66c5883ff97	KU251126-0009	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-26	13:06:32	2025-11-26 11:06:32.826	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-26 13:06:32.828167	2025-11-26 13:06:32.828167	0.00	\N
fd4f5208-27df-4bd8-b55d-9e6da6c56dfd	KU251126-0011	e8085a42-1018-435a-b5f8-6ec0f4f6d9b2	53e3741b-51ee-4d66-9f6b-33ecabd8b463	550.00	USD	CASH	PAID	2025-11-26	13:51:49	2025-11-26 11:51:49.706	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-26 13:51:49.7072	2025-11-26 13:51:49.7072	0.00	\N
ed37c0ef-08dc-4943-8ae3-e799b3c5c70b	KU251126-0012	f324cc20-ae37-42ee-886f-7388599b5b3c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1500.00	USD	CASH	PAID	2025-11-26	14:26:06	2025-11-26 12:26:06.42	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-26 14:26:06.435083	2025-11-26 14:26:06.435083	0.00	\N
73e6a2e4-971d-4238-bd83-55eccee8dae9	KU251126-0013	8264a667-ae81-48b9-84fd-d795f170737c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	540.00	USD	CASH	PAID	2025-11-26	15:04:04	2025-11-26 13:04:04.444	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-26 15:04:04.458238	2025-11-26 15:04:04.458238	0.00	\N
5fcadb12-5fd0-4789-80c2-03bd112b60ec	KU251126-0014	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-26	15:18:35	2025-11-26 13:18:35.651	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-26 15:18:35.652755	2025-11-26 15:18:35.652755	0.00	\N
8e6254af-feeb-4a58-b6d2-e11d15cb866c	KU251126-0015	3276bf6c-e1cc-4791-9e0d-44d6a9966ba4	53e3741b-51ee-4d66-9f6b-33ecabd8b463	120.00	USD	CASH	PAID	2025-11-26	15:21:38	2025-11-26 13:21:38.949	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-26 15:21:38.951118	2025-11-26 15:21:38.951118	0.00	\N
4f293e88-182c-49d0-b2d3-6c23156e379a	KU251126-0016	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	53e3741b-51ee-4d66-9f6b-33ecabd8b463	700.00	USD	CASH	PAID	2025-11-26	15:29:35	2025-11-26 13:29:35.975	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-26 15:29:35.9761	2025-11-26 15:29:35.9761	0.00	\N
452e40f3-d7a3-407d-b366-8926da198d02	KU251126-0017	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2500.00	USD	CASH	PENDING	2025-11-26	16:08:17	\N	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	wrong	2025-11-26 16:10:10.593181	2025-11-26 16:08:17.75824	2025-11-26 16:10:10.593181	0.00	\N
b991aa69-3d2b-4a38-af3b-b8223547ca0b	KU251126-0019	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-26	16:10:33	2025-11-26 14:10:33.316	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-26 16:10:33.318707	2025-11-26 16:10:33.318707	0.00	\N
5120656b-c5d9-4772-bd74-c6d0af17aa36	KU251127-0002	8e34184e-2091-4691-a5dc-329a22d316e9	6204b8eb-b190-4992-ad03-4dbb161cfff2	300.00	USD	CASH	PAID	2025-11-27	09:06:31	2025-11-27 07:06:31.039	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-27 09:06:31.041505	2025-11-27 09:06:31.041505	0.00	\N
61e72271-6cb0-4d8c-b679-7587f79391e2	KU251127-0003	8e34184e-2091-4691-a5dc-329a22d316e9	6204b8eb-b190-4992-ad03-4dbb161cfff2	100.00	USD	CASH	PAID	2025-11-27	09:13:03	2025-11-27 07:13:03.368	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-27 09:13:03.369467	2025-11-27 09:13:03.369467	0.00	\N
6067e032-a8da-4d21-9740-f1299d091846	KU251124-0014	3aefd7d8-f08a-40f7-a105-c2d0d15b1083	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-24	17:44:38	2025-11-27 07:44:03.071	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-24 17:44:38.254014	2025-11-27 09:44:03.071477	0.00	\N
6989efee-57e2-4aad-b5af-01bb9a56fbd4	KU251127-0004	d9a941c2-1f0f-42e0-b2cf-b39c1e6d0e84	6204b8eb-b190-4992-ad03-4dbb161cfff2	240.00	USD	CASH	PAID	2025-11-27	10:08:26	2025-11-27 08:08:26.332	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-27 10:08:26.334868	2025-11-27 10:08:26.334868	0.00	\N
1113ffaf-41fe-47ef-b067-77ec92334a7c	KU251127-0005	c21e9a75-8949-49c2-b2c9-ff6c316fae26	6204b8eb-b190-4992-ad03-4dbb161cfff2	200.00	USD	CASH	PAID	2025-11-27	10:35:04	2025-11-27 08:35:04.83	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-27 10:35:04.834479	2025-11-27 10:35:04.834479	0.00	\N
1d4ec18d-05fa-4e6f-8172-7e4c02ba1af0	KU251127-0008	316a4382-c50f-4fc2-8e36-7b4dd22b1a61	53e3741b-51ee-4d66-9f6b-33ecabd8b463	100.00	USD	CASH	PAID	2025-11-27	11:18:40	2025-11-27 09:18:40.953	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-27 11:18:40.959806	2025-11-27 11:18:40.959806	0.00	\N
45af40de-eece-4580-b1f7-bde85b1d0f80	KU251127-0010	9f7b27a4-b866-4e8f-9138-c385cf2b4f0c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-27	11:43:31	2025-11-27 09:43:31.021	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-27 11:43:31.023691	2025-11-27 11:43:31.023691	0.00	\N
c267b373-3e1c-452d-96b0-8be42d79e1ab	KU251127-0011	4409d9cb-e256-4088-99ee-8a257cac99bf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	250.00	USD	CASH	PAID	2025-11-27	11:55:39	2025-11-27 09:55:39.173	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-27 11:55:39.175546	2025-11-27 11:55:39.175546	0.00	\N
fc97ec5f-4c98-43bc-9504-82dd4698a24c	KU251127-0012	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-27	13:10:52	2025-11-27 11:10:52.174	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-27 13:10:52.177414	2025-11-27 13:10:52.177414	0.00	\N
d9f797a7-7bf4-4ad7-b98d-3e51fff7283d	KU251127-0014	f30f98e4-41c2-44e3-8fcd-0c8643df76d1	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-27	14:35:37	2025-11-27 12:35:37.451	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-27 14:35:37.454132	2025-11-27 14:35:37.454132	0.00	\N
7bc0c973-8bb1-40c9-89c5-54524242cef9	KU251127-0015	f30f98e4-41c2-44e3-8fcd-0c8643df76d1	53e3741b-51ee-4d66-9f6b-33ecabd8b463	150.00	USD	CASH	PAID	2025-11-27	15:17:41	2025-11-27 13:17:41.049	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-27 15:17:41.051747	2025-11-27 15:17:41.051747	0.00	\N
b0a3f7ca-baa0-4dc3-9321-3f323206cf47	KU251126-0018	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PAID	2025-11-26	16:10:22	2025-11-27 13:39:45.672	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-26 16:10:22.288717	2025-11-27 15:39:45.672708	0.00	\N
cfde4b39-8105-49ba-9faf-93e2d447943e	KU251128-0002	ee3455fe-2bf7-487c-8e25-e2dc57b63d3d	53e3741b-51ee-4d66-9f6b-33ecabd8b463	990.00	USD	CASH	PAID	2025-11-28	09:35:54	2025-11-28 07:35:54.99	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 09:35:55.008977	2025-11-28 09:35:55.008977	0.00	\N
31701080-8e7a-4cd3-ac69-25f7dd9dfb1a	KU251128-0003	d9fedfe6-0d89-49fe-b06c-97529354a88c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-11-28	09:57:22	2025-11-28 07:57:22.496	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 09:57:22.52267	2025-11-28 09:57:22.52267	0.00	\N
fa90359e-7212-40f1-abc1-05054177dc09	KU251126-0010	86b93c70-e8e1-4bce-8182-c626b082b8bf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	10000.00	USD	CASH	PAID	2025-11-26	13:42:57	2025-11-28 08:41:20.794	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-26 13:42:57.130358	2025-11-28 10:41:20.794634	0.00	\N
009825fc-a9d4-4c49-868d-b29c3264eb09	KU251128-0005	f30f98e4-41c2-44e3-8fcd-0c8643df76d1	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-28	10:44:47	2025-11-28 08:44:47.288	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 10:44:47.288747	2025-11-28 10:44:47.288747	0.00	\N
9f5266c7-dc85-4955-99f0-c7b1ef7da4be	KU251128-0007	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1300.00	USD	CASH	PAID	2025-11-28	10:53:21	2025-11-28 08:53:21.941	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 10:53:21.942023	2025-11-28 10:53:21.942023	0.00	\N
8f7f93c0-516b-448b-9d0c-b317dcc2f2e3	KU251128-0008	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-28	10:55:02	2025-11-28 08:55:02.6	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 10:55:02.600755	2025-11-28 10:55:02.600755	0.00	\N
e170fa2e-02bf-46f4-a229-6058c2a29328	KU251127-0013	1602c2a5-5908-4cbf-b14a-73d18ffafbd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-27	14:16:50	2025-11-28 11:11:31.252	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-27 14:16:50.261137	2025-11-28 13:11:31.252684	0.00	\N
1da3cbcd-d882-4810-ae82-eab3e22f6532	KU251127-0016	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PAID	2025-11-27	15:40:00	2025-11-28 11:11:39.742	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-27 15:40:00.447944	2025-11-28 13:11:39.743151	0.00	\N
abdcb10b-a560-4515-a615-2bea3c4b284b	KU251127-0001	f1a649dc-16a2-4253-b936-355894b25d72	6204b8eb-b190-4992-ad03-4dbb161cfff2	800.00	USD	CASH	PAID	2025-11-27	08:04:19	2025-11-28 11:12:47.384	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-27 08:04:19.810937	2025-11-28 13:12:47.384792	0.00	\N
2076b931-1ba1-40ba-9691-7d230d94a8cc	KU251127-0006	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1900.00	USD	CASH	PAID	2025-11-27	10:48:03	2025-11-29 08:02:07.089	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-27 10:48:03.120415	2025-11-29 10:02:07.089521	0.00	\N
cacada46-7e98-4b6b-bd20-700d8ba88bbe	KU251128-0009	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-11-28	10:56:26	2025-11-29 08:54:04.309	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 10:56:26.007672	2025-11-29 10:54:04.310153	0.00	\N
56feb69a-834f-48ca-a53c-c10560015a17	KU251127-0009	3aefd7d8-f08a-40f7-a105-c2d0d15b1083	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-27	11:21:02	2025-11-29 09:56:18.897	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-27 11:21:02.051652	2025-11-29 11:56:18.898148	0.00	\N
569c1b4d-527d-423f-9bec-27f309f3ad3d	KU251127-0007	f3d21b8c-c1d8-415f-ab1e-6307eb765b77	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PAID	2025-11-27	10:51:18	2025-12-01 09:58:14.273	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-27 10:51:18.70287	2025-12-01 11:58:14.27326	0.00	\N
4e947d92-2df7-4261-8a0d-8ac32b5d3487	KU251128-0006	86b93c70-e8e1-4bce-8182-c626b082b8bf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	10000.00	USD	CASH	PAID	2025-11-28	10:46:57	2025-12-03 10:10:13.03	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 10:46:57.638711	2025-12-03 12:10:13.031049	0.00	\N
c85730ba-c08f-45b8-b391-d5f4ba076d73	KU251128-0013	a638a2b5-611b-4b72-90df-911f4c9f823e	02a25259-aec1-4f90-ac51-d302eb267d3a	200.00	USD	CASH	PAID	2025-11-28	12:04:12	2025-11-28 10:04:12.006	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 12:04:12.007766	2025-11-28 12:04:12.007766	0.00	\N
9a996596-2e73-45a4-a51e-980c0f7a6640	KU251128-0001	580f7ae4-f6fd-4fd4-8a4f-46a53bc3fc36	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-28	08:04:47	2025-11-28 10:43:56.273	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 08:04:47.474103	2025-11-28 12:43:56.273384	0.00	\N
bd92d5dd-06b6-4b5d-92b2-de2bfb17dec7	KU251128-0014	0f29f61e-5381-4140-bd0a-3c650583b0aa	53e3741b-51ee-4d66-9f6b-33ecabd8b463	800.00	USD	CASH	PAID	2025-11-28	13:02:38	2025-11-28 11:02:38.07	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 13:02:38.070801	2025-11-28 13:02:38.070801	0.00	\N
334bb8e8-1087-4f76-ad53-6a9f74ecd172	KU251128-0015	e8085a42-1018-435a-b5f8-6ec0f4f6d9b2	53e3741b-51ee-4d66-9f6b-33ecabd8b463	150.00	USD	CASH	PAID	2025-11-28	13:41:23	2025-11-28 11:41:23.617	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 13:41:23.618065	2025-11-28 13:41:23.618065	0.00	\N
587cc319-2269-41d6-985b-6ba4b06ef748	KU251128-0017	d9fedfe6-0d89-49fe-b06c-97529354a88c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-11-28	14:43:58	2025-11-28 12:43:58.013	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 14:43:58.01443	2025-11-28 14:43:58.01443	0.00	\N
a79bffcb-a03b-4718-9f92-492601f3cffb	KU251128-0018	8e34184e-2091-4691-a5dc-329a22d316e9	53e3741b-51ee-4d66-9f6b-33ecabd8b463	410.00	USD	CASH	PAID	2025-11-28	15:31:30	2025-11-28 13:31:30.541	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 15:31:30.542144	2025-11-28 15:31:30.542144	0.00	\N
4ef68c92-3f10-47eb-9c17-0ff3da910603	KU251128-0020	c846fd1b-0329-49dd-be3f-536732398bdf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	630.00	USD	CASH	PAID	2025-11-28	16:02:14	2025-11-28 14:02:14.902	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 16:02:14.902763	2025-11-28 16:02:14.902763	0.00	\N
8c22ba2e-7301-4ed9-8e79-f8eb3eb3acea	KU251128-0022	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-28	16:09:11	2025-11-28 14:09:11.494	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 16:09:11.495004	2025-11-28 16:09:11.495004	0.00	\N
05a6168b-f56e-44c8-9396-9ca40283e35a	KU251128-0016	970181ef-e333-4707-b74c-f6818f947fd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-28	13:56:32	2025-11-28 14:20:05.174	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 13:56:32.794087	2025-11-28 16:20:05.175029	0.00	\N
86f2cd5d-04f1-4e69-aaf1-65687840094a	KU251128-0010	970181ef-e333-4707-b74c-f6818f947fd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-11-28	10:57:27	2025-11-28 14:20:26.784	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 10:57:27.287928	2025-11-28 16:20:26.785206	0.00	\N
0c88cc1f-7e00-415a-9fe8-d4e6e1de69db	KU251128-0025	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-28	17:07:24	2025-11-28 15:07:24.831	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 17:07:24.832426	2025-11-28 17:07:24.832426	0.00	\N
4f1f192d-aae2-4760-8cb6-4b5dc552974e	KU251129-0001	5515cbf4-6ee1-435a-aeb4-5e433cc31cd0	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-29	09:48:01	2025-11-29 07:48:01.614	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-29 09:48:01.623118	2025-11-29 09:48:01.623118	0.00	\N
a55005e1-e178-45f0-bd2f-d397187a1834	KU251129-0002	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	700.00	USD	CASH	PAID	2025-11-29	10:00:29	2025-11-29 08:00:29.123	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-29 10:00:29.123936	2025-11-29 10:00:29.123936	0.00	\N
4d9100c6-c7d2-45c8-af45-0ad9b354644e	KU251129-0003	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	100.00	USD	CASH	PAID	2025-11-29	10:03:11	2025-11-29 08:03:11.453	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-29 10:03:11.454645	2025-11-29 10:03:11.454645	0.00	\N
4f4106ff-27dc-405a-8571-0b887bc82ed1	KU251129-0004	dc685389-b46b-488f-b903-fc8d4743043b	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2500.00	USD	CASH	PAID	2025-11-29	10:22:30	2025-11-29 08:22:30.472	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-29 10:22:30.473473	2025-11-29 10:22:30.473473	0.00	\N
57a672f0-2ee5-4d5e-86e1-a72ffc926a57	KU251128-0011	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-28	11:26:32	2025-11-29 08:45:09.965	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 11:26:32.793386	2025-11-29 10:45:09.965729	0.00	\N
424739ba-7ca4-41ae-8bd4-a291b207686b	KU251128-0024	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PAID	2025-11-28	17:06:06	2025-11-29 08:53:33.963	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 17:06:06.169328	2025-11-29 10:53:33.963899	0.00	\N
947014ec-840d-4bc6-a13b-fcaad688fb9f	KU251128-0012	dba747bc-6b58-44b5-9c5a-88376604bf41	6204b8eb-b190-4992-ad03-4dbb161cfff2	600.00	USD	CASH	PAID	2025-11-28	11:29:00	2025-11-29 08:53:55.339	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 11:29:00.367858	2025-11-29 10:53:55.339767	0.00	\N
47032ca6-35c1-4554-a7d9-d23742fc0cb7	KU251129-0008	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-29	12:42:26	2025-11-29 10:42:26.943	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-29 12:42:26.944137	2025-11-29 12:42:26.944137	0.00	\N
78020c21-cc0d-4dc1-b93a-02cf1b777ef1	KU251129-0009	e3e44f9d-911b-4d28-b956-f314e9b74fb6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	230.00	USD	CASH	PAID	2025-11-29	12:56:54	2025-11-29 10:56:54.733	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-29 12:56:54.734667	2025-11-29 12:56:54.734667	0.00	\N
7550480b-cf7f-43e9-a92e-745c7dfb30c7	KU251128-0019	8e34184e-2091-4691-a5dc-329a22d316e9	53e3741b-51ee-4d66-9f6b-33ecabd8b463	100.00	USD	CASH	PAID	2025-11-28	15:34:01	2025-11-29 12:31:18.631	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 15:34:01.799116	2025-11-29 14:31:18.632261	0.00	\N
df99c7c0-612d-49f0-ab83-9804f94a0ef6	KU251129-0007	3aefd7d8-f08a-40f7-a105-c2d0d15b1083	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-29	11:57:23	2025-11-29 12:41:50.75	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-29 11:57:23.159818	2025-11-29 14:41:50.750558	0.00	\N
0380b00f-d109-4dfa-bf42-b83dd0bcbe16	KU251129-0013	d9a941c2-1f0f-42e0-b2cf-b39c1e6d0e84	53e3741b-51ee-4d66-9f6b-33ecabd8b463	260.00	USD	CASH	PAID	2025-11-29	14:46:32	2025-11-29 12:46:32.161	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-29 14:46:32.164493	2025-11-29 14:46:32.164493	0.00	\N
34a01dab-c776-47fb-bc9a-0f05e973b5e2	KU251129-0014	ee3455fe-2bf7-487c-8e25-e2dc57b63d3d	02a25259-aec1-4f90-ac51-d302eb267d3a	530.00	USD	CASH	PAID	2025-11-29	14:59:37	2025-11-29 12:59:37.255	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-29 14:59:37.258053	2025-11-29 14:59:37.258053	0.00	\N
1e3278e9-ec7a-4837-8c23-8c2e1f33b628	KU251129-0015	bd7755a6-ba4f-474c-a854-5857acb022a3	53e3741b-51ee-4d66-9f6b-33ecabd8b463	850.00	USD	CASH	PAID	2025-11-29	15:54:31	2025-11-29 13:54:31.555	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-29 15:54:31.557059	2025-11-29 15:54:31.557059	0.00	\N
3d6892bc-bfb7-43e6-85ea-38718552ff2d	KU251130-0001	2100ae22-fca2-454a-b231-03689a671844	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-30	07:15:30	2025-11-30 05:15:30.942	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-30 07:15:30.956783	2025-11-30 07:15:30.956783	0.00	\N
0f798233-13d9-4bfe-af4e-f71131c0f006	KU251130-0002	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1200.00	USD	CASH	PAID	2025-11-30	09:00:02	2025-11-30 07:00:02.919	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-30 09:00:02.928603	2025-11-30 09:00:02.928603	0.00	\N
0ecc6ed8-c7bc-438a-b352-c0ad219a6a01	KU251130-0004	8e34184e-2091-4691-a5dc-329a22d316e9	53e3741b-51ee-4d66-9f6b-33ecabd8b463	450.00	USD	CASH	PAID	2025-11-30	09:18:20	2025-11-30 07:18:20.943	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-30 09:18:20.946012	2025-11-30 09:18:20.946012	0.00	\N
cee950ea-071f-4c8d-a0ef-83009ec64d10	KU251129-0005	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	3000.00	USD	CASH	PAID	2025-11-29	11:34:02	2025-12-01 08:00:47.565	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-29 11:34:02.127385	2025-12-01 10:00:47.566142	0.00	\N
32085665-db89-416d-b9af-dbc40690cf86	KU251129-0010	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	900.00	USD	CASH	PAID	2025-11-29	13:02:08	2025-12-01 08:01:01.903	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-29 13:02:08.054572	2025-12-01 10:01:01.903592	0.00	\N
7cd1b1d3-0ae4-4e8e-8447-125ea37e4b29	KU251129-0011	dba747bc-6b58-44b5-9c5a-88376604bf41	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-29	13:13:56	2025-12-01 08:01:08.878	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-29 13:13:56.052743	2025-12-01 10:01:08.879043	0.00	\N
895c74b0-7f83-4fc5-bba7-af7d7dfaad2c	KU251129-0012	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	600.00	USD	CASH	PAID	2025-11-29	13:55:20	2025-12-01 08:01:24.555	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-29 13:55:20.07215	2025-12-01 10:01:24.556157	0.00	\N
85cd1469-0ea0-4ad4-bec6-7ca956bd802d	KU251130-0003	c21e9a75-8949-49c2-b2c9-ff6c316fae26	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-30	09:16:58	2025-12-01 08:04:22.536	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-30 09:16:58.036242	2025-12-01 10:04:22.53701	0.00	\N
3677ba7a-3601-4937-88f1-4c0981d3fed8	KU251130-0006	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-30	10:04:34	2025-12-01 08:04:29.253	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-30 10:04:34.600313	2025-12-01 10:04:29.253437	0.00	\N
6d3c75ae-e316-47a9-b7fb-54eff7ac899e	KU251130-0005	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-30	10:01:20	2025-12-01 08:25:55.567	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-30 10:01:20.25504	2025-12-01 10:25:55.567193	0.00	\N
91de7a1f-76ae-443d-9f2b-142b0256a3ec	KU251129-0006	93da34c6-b76f-48e7-a2c1-57de6b2082fa	53e3741b-51ee-4d66-9f6b-33ecabd8b463	250.00	USD	CASH	PAID	2025-11-29	11:35:36	2025-12-01 11:35:22.265	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-29 11:35:36.403108	2025-12-01 13:35:22.265557	0.00	\N
4b38822a-eedd-427c-a218-517891a59e42	KU251128-0021	970181ef-e333-4707-b74c-f6818f947fd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-11-28	16:07:17	2025-12-05 14:08:10.598	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 16:07:17.456185	2025-12-05 16:08:10.598585	0.00	\N
61930bd3-4876-4a37-89ae-e49d52d312ae	KU251130-0010	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-30	13:54:47	2025-12-01 07:51:44.25	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-30 13:54:47.956289	2025-12-01 09:51:44.250894	0.00	\N
4cf81e65-1760-4a46-9066-7105814456c6	KU251128-0023	4700bec5-6fb9-4f8e-ad4e-6b09f81df49a	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-11-28	16:22:09	2025-12-01 08:00:33.328	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 16:22:09.870454	2025-12-01 10:00:33.328726	0.00	\N
853c21ef-5d1a-4cf8-9f9f-3be20a883288	KU251130-0007	2100ae22-fca2-454a-b231-03689a671844	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-11-30	10:27:30	2025-12-01 08:04:10.075	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-30 10:27:30.381235	2025-12-01 10:04:10.076773	0.00	\N
716cd3a4-3395-43ce-932d-6e004a808649	KU251201-0001	568324bd-0670-46b0-a448-49986d773d95	6204b8eb-b190-4992-ad03-4dbb161cfff2	200.00	USD	CASH	PAID	2025-12-01	09:18:03	2025-12-01 08:04:36.451	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-01 09:18:03.022459	2025-12-01 10:04:36.451668	0.00	\N
054d9518-5119-4f8b-8705-560ce485eb45	KU251130-0008	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PAID	2025-11-30	11:41:05	2025-12-01 08:08:41.899	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-30 11:41:05.703461	2025-12-01 10:08:41.899902	0.00	\N
ba18261a-0c2c-4cbc-8a3e-853a212cf138	KU251201-0004	cd527560-3833-4f9d-909f-5ae148a17fd5	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PAID	2025-12-01	10:18:55	2025-12-01 08:18:55.99	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	bnk not cash	2025-12-01 10:20:00.50207	2025-12-01 10:18:55.992889	2025-12-01 10:20:00.50207	0.00	\N
b538afa2-53ba-47ec-910b-f3d1abbe9f80	KU251201-0005	cd527560-3833-4f9d-909f-5ae148a17fd5	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	BANK TRANSFER	PAID	2025-12-01	10:20:24	2025-12-01 08:20:24.845	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-01 10:20:24.846075	2025-12-01 10:20:24.846075	0.00	\N
0815c9e9-1cd2-4dad-893b-c6a228ca7896	KU251201-0006	bd7755a6-ba4f-474c-a854-5857acb022a3	53e3741b-51ee-4d66-9f6b-33ecabd8b463	410.00	USD	CASH	PAID	2025-12-01	10:58:16	2025-12-01 08:58:16.643	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-01 10:58:16.646416	2025-12-01 10:58:16.646416	0.00	\N
836b436b-f6b2-4f57-b185-e4676bd7f961	KU251201-0007	a8eb6611-3c8e-4b67-a269-68033e418688	53e3741b-51ee-4d66-9f6b-33ecabd8b463	250.00	USD	CASH	PAID	2025-12-01	11:14:45	2025-12-01 09:14:45.661	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-01 11:14:45.675512	2025-12-01 11:14:45.675512	0.00	\N
d04b9feb-b66d-4bf0-a626-e0efc458793d	KU251201-0008	84852b83-ffcb-411d-be4b-3c194a999d68	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-01	11:18:18	2025-12-01 09:18:18.484	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-01 11:18:18.486032	2025-12-01 11:18:18.486032	0.00	\N
f3ca22e0-b9b3-4184-b772-0efe16741f21	KU251201-0009	4409d9cb-e256-4088-99ee-8a257cac99bf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	210.00	USD	CASH	PAID	2025-12-01	11:25:01	2025-12-01 09:25:01.494	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-01 11:25:01.496876	2025-12-01 11:25:01.496876	0.00	\N
4f192bea-2231-4214-b3a9-2c6bd5b40a4f	KU251201-0010	77fda823-6bdf-4fc9-8530-f96a3e648550	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-01	13:10:53	2025-12-01 11:10:53.536	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-01 13:10:53.561719	2025-12-01 13:10:53.561719	0.00	\N
b5ea4b52-31b9-4702-b65b-5e9c09258953	KU251201-0011	8264a667-ae81-48b9-84fd-d795f170737c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-01	13:20:42	2025-12-01 11:20:42.937	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-01 13:20:42.955935	2025-12-01 13:20:42.955935	0.00	\N
f15ba5de-d315-4b48-bbc6-a46ef9cbafc0	KU251201-0013	93da34c6-b76f-48e7-a2c1-57de6b2082fa	53e3741b-51ee-4d66-9f6b-33ecabd8b463	350.00	USD	CASH	PAID	2025-12-01	13:35:41	2025-12-01 11:35:41.276	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-01 13:35:41.277801	2025-12-01 13:35:41.277801	0.00	\N
d81ca65a-8a9d-46e9-9022-34cae9872648	KU251201-0014	211317cb-7002-4abc-8350-ea60cd33dcd7	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-01	15:20:41	2025-12-01 13:20:41.84	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-01 15:20:41.844545	2025-12-01 15:20:41.844545	0.00	\N
d9ab04ca-de86-4cb1-a995-c364d73cb01f	KU251202-0002	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-02	08:54:52	2025-12-02 06:54:52.724	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-02 08:54:52.729939	2025-12-02 08:54:52.729939	0.00	\N
9bcd9dc0-2cb5-4a6f-931a-addd24beb315	KU251201-0015	dba747bc-6b58-44b5-9c5a-88376604bf41	6204b8eb-b190-4992-ad03-4dbb161cfff2	800.00	USD	CASH	PAID	2025-12-01	16:01:38	2025-12-02 07:04:27.963	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-01 16:01:38.821989	2025-12-02 09:04:27.96335	0.00	\N
14c14825-1b99-4859-b941-f94d75a05e45	KU251201-0016	f925cb0f-5b64-4efa-aa01-f58f2aa7b5f1	53e3741b-51ee-4d66-9f6b-33ecabd8b463	360.00	USD	CASH	PAID	2025-12-01	16:46:01	2025-12-02 07:04:34.916	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-01 16:46:01.979782	2025-12-02 09:04:34.916738	0.00	\N
425586c7-b748-469c-ac9a-7a4fcf7c79aa	KU251201-0012	dba747bc-6b58-44b5-9c5a-88376604bf41	6204b8eb-b190-4992-ad03-4dbb161cfff2	200.00	USD	CASH	PAID	2025-12-01	13:29:19	2025-12-02 07:04:42.8	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-01 13:29:19.39209	2025-12-02 09:04:42.801045	0.00	\N
800ae9d2-95b1-4fe2-93cf-cf415bbc5b9f	KU251201-0002	f1a649dc-16a2-4253-b936-355894b25d72	6204b8eb-b190-4992-ad03-4dbb161cfff2	900.00	USD	CASH	PAID	2025-12-01	09:45:01	2025-12-02 07:05:08.965	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-01 09:45:01.428456	2025-12-02 09:05:08.965881	0.00	\N
56de93cb-e37d-42b7-af57-30f21c6d25b0	KU251130-0009	dba747bc-6b58-44b5-9c5a-88376604bf41	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-11-30	11:42:18	2025-12-02 07:05:52.331	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-30 11:42:18.936952	2025-12-02 09:05:52.331326	0.00	\N
a859363d-9a00-4b4c-ba16-fe3c48f89170	KU251202-0001	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1500.00	USD	CASH	PAID	2025-12-02	06:35:50	2025-12-02 07:06:07.435	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-02 06:35:50.872154	2025-12-02 09:06:07.435936	0.00	\N
0f66d8f8-dc10-47a2-befc-a4a30d9c6b97	KU251202-0004	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-02	09:16:16	2025-12-02 07:16:16.285	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-02 09:16:16.287431	2025-12-02 09:16:16.287431	0.00	\N
9945021b-9c9a-41b9-bc20-bd9211819d67	KU251202-0003	580f7ae4-f6fd-4fd4-8a4f-46a53bc3fc36	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-02	09:12:04	2025-12-02 08:03:08.007	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-02 09:12:04.35852	2025-12-02 10:03:08.007682	0.00	\N
df8581c1-7c81-47a0-8f80-b352fdc66408	KU251202-0008	e8085a42-1018-435a-b5f8-6ec0f4f6d9b2	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-02	10:45:32	2025-12-02 08:45:32.407	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-02 10:45:32.409202	2025-12-02 10:45:32.409202	0.00	\N
8a233f77-406f-43c1-9941-0c304ff2b43a	KU251202-0009	9f7b27a4-b866-4e8f-9138-c385cf2b4f0c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	600.00	USD	CASH	PAID	2025-12-02	11:01:31	2025-12-02 09:01:31.261	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-02 11:01:31.274177	2025-12-02 11:01:31.274177	0.00	\N
e7166a1a-c003-4a9a-bf88-6960922b42b0	KU251202-0013	4198e055-01a1-4e6b-b5a5-ecf2db10e761	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1300.00	USD	CASH	PAID	2025-12-02	11:12:22	2025-12-02 09:12:22.955	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-02 11:12:22.956165	2025-12-02 11:12:22.956165	0.00	\N
36821e1b-ef39-41c5-8f5a-d1f2672f1243	KU251202-0015	81642bfc-31dc-49bf-9008-2a4fa2babe4e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-02	11:21:08	2025-12-02 09:21:08.316	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-02 11:21:08.31785	2025-12-02 11:21:08.31785	0.00	\N
c059cf73-e30f-43c7-8198-7c361fac6b77	KU251202-0016	5515cbf4-6ee1-435a-aeb4-5e433cc31cd0	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-02	11:36:12	2025-12-02 09:36:12.534	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-02 11:36:12.53573	2025-12-02 11:36:12.53573	0.00	\N
138523b5-f871-4fb7-b29f-c70ea699798c	KU251202-0012	f925cb0f-5b64-4efa-aa01-f58f2aa7b5f1	53e3741b-51ee-4d66-9f6b-33ecabd8b463	250.00	USD	CASH	PAID	2025-12-02	11:11:21	2025-12-03 09:24:30.855	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-02 11:11:21.360332	2025-12-03 11:24:30.855737	0.00	\N
177ecbdf-4c54-4724-87c3-bda396cbf2a9	KU251202-0011	6bbc4e6f-aac0-43fc-8235-82d517012bba	53e3741b-51ee-4d66-9f6b-33ecabd8b463	900.00	USD	CASH	PAID	2025-12-02	11:09:30	2025-12-03 09:24:44.472	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-02 11:09:30.993276	2025-12-03 11:24:44.472961	0.00	\N
c0e79da5-5333-47e1-95ce-5b2627d3d052	KU251202-0007	2100ae22-fca2-454a-b231-03689a671844	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-02	10:40:41	2025-12-03 09:25:08.805	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-02 10:40:41.901389	2025-12-03 11:25:08.806176	0.00	\N
2b44d7b9-21e3-4b71-ac5c-dce1b80d2962	KU251202-0010	dba747bc-6b58-44b5-9c5a-88376604bf41	53e3741b-51ee-4d66-9f6b-33ecabd8b463	800.00	USD	CASH	PAID	2025-12-02	11:08:08	2025-12-03 09:25:19.923	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-02 11:08:08.185759	2025-12-03 11:25:19.924228	0.00	\N
eca1ea5b-9968-43c6-b585-7e377fb71a21	KU251202-0006	d9d6b51f-9192-47c5-9b00-6de514dc9b70	53e3741b-51ee-4d66-9f6b-33ecabd8b463	220.00	USD	CASH	PAID	2025-12-02	10:38:32	2025-12-03 09:25:31.098	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-02 10:38:32.533645	2025-12-03 11:25:31.099112	0.00	\N
599421c5-7d71-47a9-bf6f-25493b70b1f5	KU251202-0005	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-02	09:51:59	2025-12-03 09:25:39.872	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-02 09:51:59.293014	2025-12-03 11:25:39.872463	0.00	\N
33e5df6d-ebcf-48cc-bb24-629ee016ab15	KU251201-0017	f3d21b8c-c1d8-415f-ab1e-6307eb765b77	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PAID	2025-12-01	21:21:15	2025-12-06 09:37:44.848	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-01 21:21:15.606799	2025-12-06 11:37:44.848566	0.00	\N
92072be0-ca87-4b4c-a0f7-bc6b9c4e6008	KU251202-0018	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	53e3741b-51ee-4d66-9f6b-33ecabd8b463	600.00	USD	CASH	PAID	2025-12-02	12:28:05	2025-12-02 10:28:05.617	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-02 12:28:05.631548	2025-12-02 12:28:05.631548	0.00	\N
a63f6215-4c21-4be7-a4ec-c6ff2b262c7b	KU251202-0019	f828c186-489b-482f-825d-346415a7d840	53e3741b-51ee-4d66-9f6b-33ecabd8b463	650.00	USD	CASH	PAID	2025-12-02	13:32:11	2025-12-02 11:32:11.826	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-02 13:32:11.828559	2025-12-02 13:32:11.828559	0.00	\N
35ee25c2-0689-479b-8b3e-1e80885c172c	KU251202-0020	d9fedfe6-0d89-49fe-b06c-97529354a88c	02a25259-aec1-4f90-ac51-d302eb267d3a	1000.00	USD	CASH	PAID	2025-12-02	15:27:47	2025-12-02 13:27:47.521	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-02 15:27:47.524328	2025-12-02 15:27:47.524328	0.00	\N
f43f0cce-ce95-4e20-9eec-f6743899b51b	KU251202-0021	40d63f00-ddc5-4f8c-aa25-cd57c5e237de	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-02	15:39:30	2025-12-02 13:39:30.12	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-02 15:39:30.121492	2025-12-02 15:39:30.121492	0.00	\N
61d9572e-9d5a-426b-b699-d3faf7ba2589	KU251203-0002	c1dc13bc-c230-48d7-9978-1b9920e9370e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	610.00	USD	CASH	PAID	2025-12-03	09:56:58	2025-12-03 07:56:58.107	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-03 09:56:58.108951	2025-12-03 09:56:58.108951	0.00	\N
b9f8aa35-cbbc-4a64-969f-cc70e96437e0	KU251203-0005	ee3455fe-2bf7-487c-8e25-e2dc57b63d3d	53e3741b-51ee-4d66-9f6b-33ecabd8b463	740.00	USD	CASH	PAID	2025-12-03	11:14:47	2025-12-03 09:14:47.655	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-03 11:14:47.655763	2025-12-03 11:14:47.655763	0.00	\N
4b27a732-724c-45ab-927d-ae3020ecf61e	KU251203-0006	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	3000.00	USD	CASH	PAID	2025-12-03	11:16:23	2025-12-03 09:16:23.797	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-03 11:16:23.798779	2025-12-03 11:16:23.798779	0.00	\N
ebf669a0-8865-46f1-8441-9da4461f0db5	KU251202-0017	c21e9a75-8949-49c2-b2c9-ff6c316fae26	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-02	12:07:47	2025-12-03 09:21:10.377	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-02 12:07:47.044683	2025-12-03 11:21:10.378025	0.00	\N
c1266bac-84f0-4c3a-bc55-a48c2d09d1fb	KU251202-0014	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PAID	2025-12-02	11:17:28	2025-12-03 09:24:11.26	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-02 11:17:28.751258	2025-12-03 11:24:11.260292	0.00	\N
9687a2e9-33f9-460f-937d-18c8b4db1c58	KU251203-0007	9cb5fbf2-9fae-4518-a5da-f5bb6b63aa13	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-03	11:45:40	2025-12-03 09:45:40.224	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-03 11:45:40.236815	2025-12-03 11:45:40.236815	0.00	\N
dfa0657b-89b0-4351-b8b1-5824e1d9e26a	KU251203-0008	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	600.00	USD	CASH	PAID	2025-12-03	12:08:35	2025-12-03 10:08:35.293	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-03 12:08:35.294729	2025-12-03 12:08:35.294729	0.00	\N
0293bf7d-14f6-4431-9693-0122c15cfc7a	KU251203-0009	0f639da7-b8ae-4671-a1ce-d66c76169567	53e3741b-51ee-4d66-9f6b-33ecabd8b463	700.00	USD	CASH	PAID	2025-12-03	12:36:27	2025-12-03 10:36:27.801	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-03 12:36:27.815316	2025-12-03 12:36:27.815316	0.00	\N
1c221184-5ddb-4648-922e-b00fbef63404	KU251203-0010	f3c66225-89b9-436b-aeca-ab24f912aff0	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-03	12:42:57	2025-12-03 10:42:57.025	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-03 12:42:57.02694	2025-12-03 12:42:57.02694	0.00	\N
8748fb3d-2c93-4cb8-a981-cbd6000b6351	KU251203-0011	7136d6c5-245b-421b-9bbb-84c637cf1577	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-03	12:45:09	2025-12-03 10:45:09.858	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-03 12:45:09.859947	2025-12-03 12:45:09.859947	0.00	\N
cbaf19a3-204a-432f-a880-c6f854ca334f	KU251203-0012	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-03	12:49:54	2025-12-03 10:49:54.082	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-03 12:49:54.082843	2025-12-03 12:49:54.082843	0.00	\N
9d7a2901-1adc-4a5b-bbec-68a0e916779c	KU251203-0013	d9fedfe6-0d89-49fe-b06c-97529354a88c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-03	15:29:44	2025-12-03 13:29:44.884	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-03 15:29:44.887534	2025-12-03 15:29:44.887534	0.00	\N
69af84cd-32a5-47cd-926f-8fdbb2905f8d	KU251201-0003	3aefd7d8-f08a-40f7-a105-c2d0d15b1083	53e3741b-51ee-4d66-9f6b-33ecabd8b463	600.00	USD	CASH	PAID	2025-12-01	09:49:16	2025-12-03 13:40:51.524	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-01 09:49:16.003454	2025-12-03 15:40:51.524533	0.00	\N
bcf9732f-4363-4a37-bb38-d3400624674d	KU251203-0015	970181ef-e333-4707-b74c-f6818f947fd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PAID	2025-12-03	17:22:21	2025-12-03 15:22:21.184	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-03 17:22:21.198751	2025-12-03 17:22:21.198751	0.00	\N
b68b03d4-6a52-4d08-a61f-dc9fdbfd7da0	KU251204-0001	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-04	09:09:42	2025-12-04 07:09:42.449	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 09:09:42.461746	2025-12-04 09:09:42.461746	0.00	\N
ab7b7eb3-a804-4bd8-90fe-8cb8827ce7e2	KU251204-0002	1f489418-3102-47b6-9a8c-2db366f37c1a	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-04	09:24:31	2025-12-04 07:24:31.168	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 09:24:31.185755	2025-12-04 09:24:31.185755	0.00	\N
b4331155-2285-4ec2-bc1f-5c7f9a6e3c26	KU251204-0004	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-04	09:48:30	2025-12-04 07:48:30.789	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 09:48:30.810118	2025-12-04 09:48:30.810118	0.00	\N
3cd15ddc-8bb8-4c05-80b4-cfa12c36560f	KU251204-0005	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	910.00	USD	CASH	PAID	2025-12-04	10:01:43	2025-12-04 08:01:43.722	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 10:01:43.725427	2025-12-04 10:01:43.725427	0.00	\N
cc899068-d441-45a5-b2b0-e5cb0f56e602	KU251204-0006	dc685389-b46b-488f-b903-fc8d4743043b	53e3741b-51ee-4d66-9f6b-33ecabd8b463	8060.00	USD	BANK TRANSFER	PAID	2025-12-04	10:10:44	2025-12-04 08:10:44.578	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 10:10:44.58114	2025-12-04 10:10:44.58114	0.00	\N
04dbfc4f-f769-4540-9711-29c6258711ef	KU251204-0008	dd35069f-40bd-423b-9b0a-edc6781db7a5	02a25259-aec1-4f90-ac51-d302eb267d3a	200.00	USD	CASH	PAID	2025-12-04	10:42:12	2025-12-04 08:42:12.237	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 10:42:12.239387	2025-12-04 10:42:12.239387	0.00	\N
f3744abd-3a5b-4e1a-90f0-abc5a8c9751f	KU251204-0009	f30f98e4-41c2-44e3-8fcd-0c8643df76d1	53e3741b-51ee-4d66-9f6b-33ecabd8b463	320.00	USD	CASH	PAID	2025-12-04	11:09:45	2025-12-04 09:09:45.239	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 11:09:45.243036	2025-12-04 11:09:45.243036	0.00	\N
e5cd0e27-205f-4906-a11f-5417d18fe142	KU251203-0001	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-03	09:55:45	2025-12-04 09:12:21.391	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-03 09:55:45.964411	2025-12-04 11:12:21.392332	0.00	\N
1e5663f8-e400-4405-8d1a-b4afab006c92	KU251203-0014	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-03	15:41:22	2025-12-04 09:12:47.057	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-03 15:41:22.922775	2025-12-04 11:12:47.057503	0.00	\N
f7f6ab01-088b-4690-9a72-7bc22a74e822	KU251203-0004	dba747bc-6b58-44b5-9c5a-88376604bf41	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-03	11:09:33	2025-12-04 09:12:55.137	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-03 11:09:33.011648	2025-12-04 11:12:55.137926	0.00	\N
f3c849a6-8e30-4385-b886-40c29697563c	KU251204-0007	dc685389-b46b-488f-b903-fc8d4743043b	6204b8eb-b190-4992-ad03-4dbb161cfff2	8060.00	USD	BANK TRANSFER	PAID	2025-12-04	10:11:13	2025-12-04 08:11:13.189	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	t	duplicate	2025-12-04 12:08:30.335932	2025-12-04 10:11:13.191079	2025-12-04 12:08:30.335932	0.00	\N
2802b113-5899-4a82-ab11-ae9cc351ab4a	KU251204-0010	766a1abb-ff70-4b91-b44b-9988786581f0	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1500.00	USD	CASH	PAID	2025-12-04	12:26:28	2025-12-04 10:26:28.285	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 12:26:28.312278	2025-12-04 12:26:28.312278	0.00	\N
b122151b-e2b4-4164-bd5f-f8b8870673fb	KU251204-0011	c846fd1b-0329-49dd-be3f-536732398bdf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-04	12:43:42	2025-12-04 10:43:42.905	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 12:43:42.912002	2025-12-04 12:43:42.912002	0.00	\N
bddbc327-a85d-4a89-a049-c26f4df6027c	KU251204-0013	0f639da7-b8ae-4671-a1ce-d66c76169567	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-04	12:53:08	2025-12-04 10:53:08.599	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 12:53:08.600561	2025-12-04 12:53:08.600561	0.00	\N
edddd4e3-059b-4651-977b-2b58a2ea729c	KU251204-0014	dba747bc-6b58-44b5-9c5a-88376604bf41	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-04	12:55:05	2025-12-04 10:55:05.761	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	NOT PAID	2025-12-04 12:55:40.330827	2025-12-04 12:55:05.762892	2025-12-04 12:55:40.330827	0.00	\N
b184a91d-4863-4abb-992a-96934a266796	KU251204-0003	9f7b27a4-b866-4e8f-9138-c385cf2b4f0c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-04	09:33:30	2025-12-05 08:34:01.209	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 09:33:30.265187	2025-12-05 10:34:01.20932	0.00	\N
a44da2d5-e69d-46f1-8d9a-d1777a7b3e9a	KU251204-0012	9f7b27a4-b866-4e8f-9138-c385cf2b4f0c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-04	12:48:40	2025-12-05 08:34:06.4	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 12:48:40.776386	2025-12-05 10:34:06.400581	0.00	\N
2b534c66-82e9-4ece-bd76-449e3ccd0b94	KU251204-0015	dba747bc-6b58-44b5-9c5a-88376604bf41	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-04	12:56:03	2025-12-05 08:34:26.641	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 12:56:03.657611	2025-12-05 10:34:26.642147	0.00	\N
38b1ba95-f077-4ec0-8b72-3b8574c6d378	KU251204-0016	2100ae22-fca2-454a-b231-03689a671844	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-04	12:57:09	2025-12-05 08:34:54.684	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 12:57:09.714144	2025-12-05 10:34:54.684747	0.00	\N
55439063-79a5-40f7-8747-e2c37f56abaf	KU251204-0018	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-04	13:50:42	2025-12-04 11:50:42.239	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 13:50:42.262526	2025-12-04 13:50:42.262526	0.00	\N
0a8b6e96-c7db-48bb-ab26-9f5ce8e40f93	KU251204-0019	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	3000.00	USD	CASH	PAID	2025-12-04	15:17:41	2025-12-04 13:17:41.836	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 15:17:41.847036	2025-12-04 15:17:41.847036	0.00	\N
e68f73db-53ba-40fc-9a8c-040636dd2b88	KU251204-0021	e5637070-3483-46e6-9b4f-5e03c1f1d211	53e3741b-51ee-4d66-9f6b-33ecabd8b463	460.00	USD	CASH	PAID	2025-12-04	15:32:52	2025-12-04 13:32:52.778	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 15:32:52.780987	2025-12-04 15:32:52.780987	0.00	\N
7d5ac823-1a51-48b3-93b8-c823c3c0b266	KU251204-0022	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	600.00	USD	CASH	PAID	2025-12-04	15:36:01	2025-12-04 13:36:01.273	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 15:36:01.275239	2025-12-04 15:36:01.275239	0.00	\N
87cbebc1-c439-424c-bf3c-7ba65c522af1	KU251204-0023	60fb4144-ba84-48b6-940c-b5fb58bd0ee7	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-04	15:46:47	2025-12-04 13:46:47.445	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 15:46:47.456824	2025-12-04 15:46:47.456824	0.00	\N
60364788-8312-4884-a743-d48455c10285	KU251204-0024	e21cbb1d-137a-4ed8-b5e4-00e828e9f278	53e3741b-51ee-4d66-9f6b-33ecabd8b463	730.00	USD	CASH	PAID	2025-12-04	15:47:45	2025-12-04 13:47:45.659	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 15:47:45.661201	2025-12-04 15:47:45.661201	0.00	\N
dafb0826-ae67-401f-b0bb-b0f0392468af	KU251205-0001	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-05	09:33:13	2025-12-05 07:33:13.103	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-05 09:33:13.12981	2025-12-05 09:33:13.12981	0.00	\N
13ee6d0c-9fac-4962-82ed-0b794706a444	KU251205-0003	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-05	09:40:42	2025-12-05 07:40:42.172	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	NOT PAID	2025-12-05 09:41:16.185545	2025-12-05 09:40:42.173895	2025-12-05 09:41:16.185545	0.00	\N
a146dbae-4180-4b60-9288-0f6613da68a4	KU251205-0005	8e34184e-2091-4691-a5dc-329a22d316e9	02a25259-aec1-4f90-ac51-d302eb267d3a	500.00	USD	CASH	PAID	2025-12-05	10:09:15	2025-12-05 08:09:15.118	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-05 10:09:15.124442	2025-12-05 10:09:15.124442	0.00	\N
8f815d01-25c2-4c5b-9123-3ced67791199	KU251205-0006	ee3455fe-2bf7-487c-8e25-e2dc57b63d3d	02a25259-aec1-4f90-ac51-d302eb267d3a	900.00	USD	CASH	PAID	2025-12-05	10:18:59	2025-12-05 08:18:59.468	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-05 10:18:59.470834	2025-12-05 10:18:59.470834	0.00	\N
7d7b58b2-5808-4a3a-be31-86f410663c8f	KU251203-0003	86b93c70-e8e1-4bce-8182-c626b082b8bf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	10000.00	USD	CASH	PAID	2025-12-03	10:58:13	2025-12-05 08:25:19.421	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-03 10:58:13.037974	2025-12-05 10:25:19.421313	0.00	\N
cb977d1c-b87b-491f-8070-b456864767c4	KU251204-0020	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2100.00	USD	CASH	PAID	2025-12-04	15:29:09	2025-12-05 08:34:45.164	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 15:29:09.50776	2025-12-05 10:34:45.165188	0.00	\N
51215f01-5605-421b-aed9-e7bb52eac531	KU251204-0017	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	800.00	USD	CASH	PAID	2025-12-04	13:12:41	2025-12-05 08:35:03.992	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 13:12:41.451913	2025-12-05 10:35:03.992341	0.00	\N
c883c86e-dfef-4545-8aa1-b79180843bf2	KU251204-0025	6bbc4e6f-aac0-43fc-8235-82d517012bba	6204b8eb-b190-4992-ad03-4dbb161cfff2	1250.00	USD	CASH	PAID	2025-12-04	17:01:45	2025-12-05 08:35:13.159	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 17:01:45.264685	2025-12-05 10:35:13.15976	0.00	\N
5cb25370-c3c1-4246-b0d8-8300a4ab4523	KU251204-0026	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-04	17:04:11	2025-12-05 08:35:22.062	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-04 17:04:11.884084	2025-12-05 10:35:22.062332	0.00	\N
0afc257d-4824-4007-9eff-3da80ec76720	KU251205-0008	4409d9cb-e256-4088-99ee-8a257cac99bf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	370.00	USD	CASH	PAID	2025-12-05	10:41:05	2025-12-05 08:41:05.601	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-05 10:41:05.608006	2025-12-05 10:41:05.608006	0.00	\N
464096e6-6c9c-4364-aff9-1adc989120da	KU251128-0004	dc685389-b46b-488f-b903-fc8d4743043b	6204b8eb-b190-4992-ad03-4dbb161cfff2	5000.00	USD	BANK TRANSFER	PAID	2025-11-28	10:43:29	2025-12-05 08:45:29.016	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-28 10:43:29.842587	2025-12-05 10:45:29.016752	0.00	\N
290a5914-dedc-4792-9028-c1156225813f	KU251205-0009	ed27f8db-83f3-4dd7-ab16-5c315c233794	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-05	11:24:43	2025-12-05 09:24:43.861	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-05 11:24:43.881989	2025-12-05 11:24:43.881989	0.00	\N
029d05a8-f566-4fd9-a4a2-465e703d18ac	KU251205-0011	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-05	12:56:03	2025-12-05 10:56:03.469	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-05 12:56:03.471569	2025-12-05 12:56:03.471569	0.00	\N
17470435-6d1a-4023-b9d6-101f6d5ac973	KU251205-0012	f324cc20-ae37-42ee-886f-7388599b5b3c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1400.00	USD	CASH	PAID	2025-12-05	12:57:40	2025-12-05 10:57:40.333	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-05 12:57:40.334895	2025-12-05 12:57:40.334895	0.00	\N
d67f9017-916d-4cc0-94fb-8c0b744ec422	KU251205-0010	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	53e3741b-51ee-4d66-9f6b-33ecabd8b463	900.00	USD	CASH	PAID	2025-12-05	12:54:11	2025-12-05 10:58:40.338	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-05 12:54:11.813877	2025-12-05 12:58:40.33864	0.00	\N
648765ad-b47e-4a1e-8410-6c54ba0ed3e7	KU251205-0014	3aefd7d8-f08a-40f7-a105-c2d0d15b1083	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-05	14:26:25	2025-12-05 12:26:25.806	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-05 14:26:25.815378	2025-12-05 14:26:25.815378	0.00	\N
764e2d92-dac1-4e34-b418-9c7fd2696c9c	KU251205-0018	f1a649dc-16a2-4253-b936-355894b25d72	6204b8eb-b190-4992-ad03-4dbb161cfff2	1000.00	USD	CASH	PENDING	2025-12-05	16:20:07	\N	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	t	new day	2025-12-06 06:23:16.981268	2025-12-05 16:20:07.253613	2025-12-06 06:23:16.981268	0.00	\N
310d5f3a-a329-4dbe-a7f9-9b68dfbcc7df	KU251206-0001	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-06	06:23:53	2025-12-06 04:23:53.082	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 06:23:53.099713	2025-12-06 06:23:53.099713	0.00	\N
4c7a8d73-7934-41c9-afa6-5303d9ed2aca	KU251206-0003	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-06	09:07:45	2025-12-06 07:07:45.442	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 09:07:45.443561	2025-12-06 09:07:45.443561	0.00	\N
4938bb51-1fd7-4fa6-8c4f-bd4ef755dd8c	KU251206-0004	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-06	09:08:13	2025-12-06 07:08:13.624	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 09:08:13.625025	2025-12-06 09:08:13.625025	0.00	\N
343fa678-e3a2-4913-b8ca-794687014501	KU251206-0006	9f7b27a4-b866-4e8f-9138-c385cf2b4f0c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-06	09:42:10	2025-12-06 07:42:10.905	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 09:42:10.91783	2025-12-06 09:42:10.91783	0.00	\N
9bc12a15-a60d-4df2-b372-9109ce9fddd9	KU251206-0007	8e34184e-2091-4691-a5dc-329a22d316e9	53e3741b-51ee-4d66-9f6b-33ecabd8b463	700.00	USD	CASH	PAID	2025-12-06	09:44:19	2025-12-06 07:44:19.614	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 09:44:19.6158	2025-12-06 09:44:19.6158	0.00	\N
03dfbfbe-b447-4189-98c4-a33e4a718b71	KU251205-0004	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-05	09:41:33	2025-12-06 09:31:00.542	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-05 09:41:33.409011	2025-12-06 11:31:00.543153	0.00	\N
16aa87ad-33e0-4473-8a48-d75a3f65416f	KU251205-0016	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-05	15:11:23	2025-12-06 09:31:23.468	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-05 15:11:23.467895	2025-12-06 11:31:23.46877	0.00	\N
1c9ee2fe-b633-4ba8-99d0-40a1e49dd0f3	KU251205-0017	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	6204b8eb-b190-4992-ad03-4dbb161cfff2	400.00	USD	CASH	PAID	2025-12-05	16:19:22	2025-12-06 09:31:33.865	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-05 16:19:22.902383	2025-12-06 11:31:33.866108	0.00	\N
2f85fa3e-d5f0-4c49-b485-4c63189e8208	KU251206-0009	e3e44f9d-911b-4d28-b956-f314e9b74fb6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-06	10:39:02	2025-12-06 08:39:02.747	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 10:39:02.761185	2025-12-06 10:39:02.761185	0.00	\N
d1f00f02-453c-4fb1-97af-195eb22344e5	KU251206-0010	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	02a25259-aec1-4f90-ac51-d302eb267d3a	600.00	USD	CASH	PAID	2025-12-06	11:06:51	2025-12-06 09:06:51.291	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 11:06:51.293412	2025-12-06 11:06:51.293412	0.00	\N
fa3bf914-bd21-44da-8116-0c09dc7e2adc	KU251205-0002	c21e9a75-8949-49c2-b2c9-ff6c316fae26	53e3741b-51ee-4d66-9f6b-33ecabd8b463	450.00	USD	CASH	PAID	2025-12-05	09:39:11	2025-12-06 09:30:55.251	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-05 09:39:11.030191	2025-12-06 11:30:55.25206	0.00	\N
4c70f74b-ba2b-40bd-af1a-d3ca0ba99e66	KU251206-0013	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-06	12:22:43	2025-12-06 10:22:43.231	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 12:22:43.247188	2025-12-06 12:22:43.247188	0.00	\N
106a1347-cdc0-477d-92c3-f7605d21d9ed	KU251206-0015	84852b83-ffcb-411d-be4b-3c194a999d68	02a25259-aec1-4f90-ac51-d302eb267d3a	400.00	USD	CASH	PAID	2025-12-06	12:32:57	2025-12-06 10:32:57.853	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 12:32:57.854023	2025-12-06 12:32:57.854023	0.00	\N
a90e4097-6fb2-48f0-8c63-7f996c480f63	KU251206-0014	84852b83-ffcb-411d-be4b-3c194a999d68	02a25259-aec1-4f90-ac51-d302eb267d3a	400.00	USD	CASH	PAID	2025-12-06	12:32:26	2025-12-06 10:32:26.535	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	t	DABUL	2025-12-06 12:41:01.91789	2025-12-06 12:32:26.536818	2025-12-06 12:41:01.91789	0.00	\N
06b81ac6-3701-4356-91a4-97b411c5708e	KU251206-0018	48c75540-955e-4fa8-a024-b61780e4e248	53e3741b-51ee-4d66-9f6b-33ecabd8b463	250.00	USD	CASH	PAID	2025-12-06	14:04:50	2025-12-06 12:04:50.434	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 14:04:50.450461	2025-12-06 14:04:50.450461	0.00	\N
08cdf7d7-6358-40fb-b8f9-cf876397d91f	KU251206-0302	af162ea1-66d7-4fdd-92fb-5d69ae46ba75	53e3741b-51ee-4d66-9f6b-33ecabd8b463	210.00	USD	CASH	PAID	2025-12-06	15:46:53	2025-12-06 13:46:53.651	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 15:46:53.684533	2025-12-06 15:46:53.684533	0.00	\N
424d5331-0f7b-4f10-8698-9c21ab5bcc3e	KU251206-0012	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	900.00	USD	CASH	PAID	2025-12-06	11:56:40	2025-12-08 11:39:16.342	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 11:56:40.248438	2025-12-08 13:39:16.343798	0.00	\N
5f5aa0ef-64c2-49a0-b6aa-cfa0801e072a	KU251206-0016	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	3000.00	USD	CASH	PAID	2025-12-06	12:42:45	2025-12-08 11:39:31.195	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 12:42:45.746743	2025-12-08 13:39:31.197103	0.00	\N
d954ab03-2abc-4ecb-abf4-72ff356925e2	KU251206-0017	c4629f98-e943-497b-9f67-00e7237ebf0a	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-06	12:45:09	2025-12-08 11:39:54.01	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 12:45:09.023452	2025-12-08 13:39:54.010413	0.00	\N
070ed970-2647-4214-9fe3-ab9f03d125d8	KU251206-0002	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-06	09:07:18	2025-12-08 11:41:47.702	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 09:07:18.644672	2025-12-08 13:41:47.702919	0.00	\N
16dd6ef6-e8bd-4604-84ee-75ae8265ffc8	KU251205-0013	970181ef-e333-4707-b74c-f6818f947fd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-05	14:15:43	2025-12-08 13:38:38.909	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-05 14:15:43.081068	2025-12-08 15:38:38.909576	0.00	\N
92f8f4ab-0b7f-453c-9ba3-4e47651bf528	KU251206-5644	4700bec5-6fb9-4f8e-ad4e-6b09f81df49a	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1500.00	USD	CASH	PAID	2025-12-06	15:47:14	2025-12-10 07:52:00.698	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 15:47:14.514947	2025-12-10 09:52:00.699425	0.00	\N
956fde4f-8156-41bd-9a3b-7166fa71525e	KU251206-0005	f3d21b8c-c1d8-415f-ab1e-6307eb765b77	53e3741b-51ee-4d66-9f6b-33ecabd8b463	3000.00	USD	CASH	PAID	2025-12-06	09:16:42	2025-12-11 09:08:22.916	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 09:16:42.708614	2025-12-11 11:08:22.917614	0.00	\N
237e9024-1952-48ae-a14f-7a4602cab80b	KU251206-0008	580f7ae4-f6fd-4fd4-8a4f-46a53bc3fc36	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-06	09:54:22	2025-12-26 13:47:37.942	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 09:54:22.664961	2025-12-26 15:47:37.942646	0.00	\N
a616d06c-3e19-4e8f-8066-b3b694983ab0	KU251205-0015	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PAID	2025-12-05	15:10:32	2026-01-02 07:36:12.801	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-05 15:10:32.723394	2026-01-02 09:36:12.802909	0.00	\N
7c025f0a-7db2-4906-9b54-71a6dc6c4c5a	KU251206-5425	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-06	15:48:10	2025-12-06 13:48:10.201	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 15:48:10.202656	2025-12-06 15:48:10.202656	0.00	\N
346ad292-6644-491f-ad9e-5bff48e5d998	KU251206-0410	ee3455fe-2bf7-487c-8e25-e2dc57b63d3d	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-06	15:48:36	2025-12-06 13:48:36.116	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 15:48:36.117829	2025-12-06 15:48:36.117829	0.00	\N
2e11bcb9-723b-4ae8-9787-eed66202f320	KU251206-0407	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-06	15:49:42	2025-12-06 13:49:42.153	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 15:49:42.15388	2025-12-06 15:49:42.15388	0.00	\N
b8507dd4-47c8-4eb0-89d9-4b7db69f5f11	KU251207-4505	f828c186-489b-482f-825d-346415a7d840	53e3741b-51ee-4d66-9f6b-33ecabd8b463	10.00	USD	CASH	PAID	2025-12-07	09:47:59	2025-12-07 07:47:59.913	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	test	2025-12-07 09:48:26.331298	2025-12-07 09:47:59.944255	2025-12-07 09:48:26.331298	0.00	\N
3e2b4703-f8f4-4dce-a500-96fd73b818b2	KU251207-4506	dba747bc-6b58-44b5-9c5a-88376604bf41	53e3741b-51ee-4d66-9f6b-33ecabd8b463	10.00	USD	CASH	PAID	2025-12-07	09:49:54	2025-12-07 07:49:54.42	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	test	2025-12-07 09:50:30.842227	2025-12-07 09:49:54.426924	2025-12-07 09:50:30.842227	0.00	\N
c5eb3502-05e9-4797-aefe-3f3a7567f118	KU251207-0003	dba747bc-6b58-44b5-9c5a-88376604bf41	53e3741b-51ee-4d66-9f6b-33ecabd8b463	10.00	USD	CASH	PAID	2025-12-07	09:52:40	2025-12-07 07:52:40.465	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	test	2025-12-07 09:52:58.287737	2025-12-07 09:52:40.472175	2025-12-07 09:52:58.287737	0.00	\N
f1a3c5d3-86e7-4bd8-9066-fa5f13e01d27	KU251208-0002	81642bfc-31dc-49bf-9008-2a4fa2babe4e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-08	08:43:16	2025-12-08 06:43:16.955	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-08 08:43:16.957622	2025-12-08 08:43:16.957622	0.00	\N
31f349be-9484-4603-ad8b-1ff695c8f3f8	KU251208-0004	81642bfc-31dc-49bf-9008-2a4fa2babe4e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-08	10:32:17	2025-12-08 08:32:17.837	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-08 10:32:17.839475	2025-12-08 10:32:17.839475	0.00	\N
32e168a0-8e8c-49cd-a7e2-19599f4f1a66	KU251208-0007	bd7755a6-ba4f-474c-a854-5857acb022a3	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-08	10:52:35	2025-12-08 08:52:35.548	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-08 10:52:35.550767	2025-12-08 10:52:35.550767	0.00	\N
ad94cf51-ff5a-43f7-8592-4ce9439ecd2e	KU251208-0010	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-08	11:34:29	2025-12-08 09:34:29.433	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-08 11:34:29.434816	2025-12-08 11:34:29.434816	0.00	\N
a92b2c2b-f6f3-43aa-95b8-284986b49930	KU251208-0013	bd7755a6-ba4f-474c-a854-5857acb022a3	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1380.00	USD	CASH	PAID	2025-12-08	13:25:08	2025-12-08 11:25:08.503	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-08 13:25:08.505039	2025-12-08 13:25:08.505039	0.00	\N
5f7b8987-153a-4876-8b3d-b2b2cf5b6834	KU251206-0011	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-06	11:55:12	2025-12-08 11:39:04.912	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 11:55:12.891217	2025-12-08 13:39:04.913861	0.00	\N
c54ee7b8-f73f-41e5-bc8d-6fe5ea35d27a	KU251206-9937	2100ae22-fca2-454a-b231-03689a671844	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-06	15:48:58	2025-12-08 11:40:19.977	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 15:48:58.238801	2025-12-08 13:40:19.977634	0.00	\N
945b8cd9-705c-4736-9407-1ee1934b3ab2	KU251206-1957	c21e9a75-8949-49c2-b2c9-ff6c316fae26	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-06	15:49:17	2025-12-08 11:40:28.222	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-06 15:49:17.097153	2025-12-08 13:40:28.222869	0.00	\N
252cec5a-4042-4f7c-bc83-d35ab5f259da	KU251207-0004	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	310.00	USD	CASH	PAID	2025-12-07	10:57:22	2025-12-08 11:41:22.568	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-07 10:57:22.239711	2025-12-08 13:41:22.568812	0.00	\N
4600e1eb-16b8-4a8d-a91e-0abdbe6ee012	KU251208-0011	d9fedfe6-0d89-49fe-b06c-97529354a88c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-08	11:59:06	2025-12-08 12:21:32.109	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-08 11:59:06.059891	2025-12-08 14:21:32.110487	0.00	\N
2ec93dd8-05d0-48f9-90f7-93097f3cc651	KU251208-0014	4be0e1ae-b1c7-42fd-b2d1-1ae7ffc7e31e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	360.00	USD	CASH	PAID	2025-12-08	15:35:36	2025-12-08 13:35:36.732	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	MISTK	2025-12-08 15:36:00.230967	2025-12-08 15:35:36.732895	2025-12-08 15:36:00.230967	0.00	\N
2aca34ca-9f77-47da-b7f6-a278e2c3fefa	KU251208-0015	4be0e1ae-b1c7-42fd-b2d1-1ae7ffc7e31e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	365.00	USD	CASH	PAID	2025-12-08	15:36:12	2025-12-08 13:36:12.121	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-08 15:36:12.122469	2025-12-08 15:36:12.122469	0.00	\N
1aa12ddb-e62b-4145-8e6d-da8119e756b0	KU251208-0018	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-08	16:02:56	2025-12-08 14:02:56.098	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-08 16:02:56.099586	2025-12-08 16:02:56.099586	0.00	\N
e8d57693-7b57-4872-bb04-1bf07db1dd3c	KU251209-0001	81642bfc-31dc-49bf-9008-2a4fa2babe4e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-09	09:04:48	2025-12-09 07:04:48.341	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 09:04:48.344747	2025-12-09 09:04:48.344747	0.00	\N
7ffa92e9-126a-471e-826e-eec10568ff21	KU251209-0002	211317cb-7002-4abc-8350-ea60cd33dcd7	53e3741b-51ee-4d66-9f6b-33ecabd8b463	800.00	USD	CASH	PAID	2025-12-09	09:07:28	2025-12-09 07:07:28.521	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 09:07:28.52456	2025-12-09 09:07:28.52456	0.00	\N
f0f8e7d3-da7c-4f33-91b3-2acd9c710ad9	KU251209-0003	cd527560-3833-4f9d-909f-5ae148a17fd5	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-09	09:32:26	2025-12-09 07:32:26.06	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 09:32:26.06079	2025-12-09 09:32:26.06079	0.00	\N
0cca8390-b887-406e-9c1b-fd82e8ef4b4e	KU251209-0004	9f5aed3b-a66e-4b40-acae-7a21ced33164	02a25259-aec1-4f90-ac51-d302eb267d3a	400.00	USD	CASH	PAID	2025-12-09	09:42:22	2025-12-09 07:42:22.176	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 09:42:22.177537	2025-12-09 09:42:22.177537	0.00	\N
4dd85f6f-79a8-480e-8f1a-b5898c449032	KU251209-0005	ed27f8db-83f3-4dd7-ab16-5c315c233794	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-09	09:46:32	2025-12-09 07:46:32.101	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 09:46:32.103004	2025-12-09 09:46:32.103004	0.00	\N
37bc69f2-63b0-4170-8345-76d481a7aac2	KU251209-0006	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-09	09:51:40	2025-12-09 07:51:40.917	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 09:51:40.917992	2025-12-09 09:51:40.917992	0.00	\N
7b373f7b-219e-4f0d-9424-f656f9c4c67c	KU251208-0001	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-08	07:53:46	2025-12-09 07:58:41.735	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-08 07:53:46.015312	2025-12-09 09:58:41.736313	0.00	\N
04e92c8d-8c20-48c2-b8eb-4ddae431be0d	KU251208-0003	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	3000.00	USD	CASH	PAID	2025-12-08	08:59:02	2025-12-09 07:58:53.888	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-08 08:59:02.297513	2025-12-09 09:58:53.889267	0.00	\N
59220905-8200-443e-b4d2-89ca6f634096	KU251208-0005	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-08	10:37:42	2025-12-09 07:59:10.357	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-08 10:37:42.981764	2025-12-09 09:59:10.358123	0.00	\N
03da027c-ec4d-46c3-a7b9-e911f832b635	KU251208-0006	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-08	10:39:27	2025-12-09 07:59:23.838	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-08 10:39:27.932293	2025-12-09 09:59:23.839332	0.00	\N
83922be4-d4d8-4c60-9ac0-b4b435f3bd56	KU251208-0008	9f7b27a4-b866-4e8f-9138-c385cf2b4f0c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-08	11:22:59	2025-12-09 07:59:37.203	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-08 11:22:59.321531	2025-12-09 09:59:37.203849	0.00	\N
beacdcc5-9c2f-41fc-96e2-822421e374db	KU251208-0009	316a4382-c50f-4fc2-8e36-7b4dd22b1a61	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-08	11:25:19	2025-12-09 07:59:46.065	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-08 11:25:19.35969	2025-12-09 09:59:46.065407	0.00	\N
02606b28-85df-4d0a-bf6b-a5d5627862ec	KU251208-0012	dba747bc-6b58-44b5-9c5a-88376604bf41	53e3741b-51ee-4d66-9f6b-33ecabd8b463	800.00	USD	CASH	PAID	2025-12-08	12:04:27	2025-12-09 07:59:53.228	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-08 12:04:27.710588	2025-12-09 09:59:53.228609	0.00	\N
6e844f87-c857-4b2d-a7c6-26b886347af0	KU251208-0016	0f639da7-b8ae-4671-a1ce-d66c76169567	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-08	15:54:15	2025-12-09 08:00:00.625	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-08 15:54:15.958099	2025-12-09 10:00:00.625406	0.00	\N
1d63d111-3599-45db-a722-116320c1f81b	KU251208-0017	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	800.00	USD	CASH	PAID	2025-12-08	15:55:55	2025-12-09 08:00:37.579	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-08 15:55:55.164119	2025-12-09 10:00:37.580223	0.00	\N
eff446ca-1569-43c9-a899-252008def71f	KU251209-0008	0f639da7-b8ae-4671-a1ce-d66c76169567	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-09	10:05:40	2025-12-09 08:05:40.405	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 10:05:40.406426	2025-12-09 10:05:40.406426	0.00	\N
8a749a73-4709-40ba-aaa6-e946b33e86c7	KU251209-0009	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	100.00	USD	CASH	PAID	2025-12-09	10:27:55	2025-12-10 07:47:26.811	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 10:27:55.205084	2025-12-10 09:47:26.81274	0.00	\N
3c80a1ca-ec37-424b-81b2-42e94b92f014	KU251209-0010	3aefd7d8-f08a-40f7-a105-c2d0d15b1083	53e3741b-51ee-4d66-9f6b-33ecabd8b463	900.00	USD	CASH	PAID	2025-12-09	10:48:09	2025-12-09 08:48:09.826	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 10:48:09.827631	2025-12-09 10:48:09.827631	0.00	\N
50e971ec-dd75-4926-bec0-23826068372c	KU251209-0011	5515cbf4-6ee1-435a-aeb4-5e433cc31cd0	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-09	11:33:00	2025-12-09 09:33:00.158	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 11:33:00.159617	2025-12-09 11:33:00.159617	0.00	\N
6fb3e24a-f0cd-4afc-a669-85e646a7a0c0	KU251209-0012	e5637070-3483-46e6-9b4f-5e03c1f1d211	53e3741b-51ee-4d66-9f6b-33ecabd8b463	680.00	USD	CASH	PAID	2025-12-09	11:41:26	2025-12-09 09:41:26.834	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 11:41:26.835515	2025-12-09 11:41:26.835515	0.00	\N
d290084f-6f1d-4c85-951f-fd21664b3c39	KU251209-0013	81642bfc-31dc-49bf-9008-2a4fa2babe4e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-09	12:03:57	2025-12-09 10:03:57.655	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 12:03:57.656193	2025-12-09 12:03:57.656193	0.00	\N
a369c2ab-3553-4a37-a56a-7fe4cdf94e82	KU251209-0014	61c18c87-f840-43d5-91ea-0c9c54a80040	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1500.00	USD	CASH	PAID	2025-12-09	12:05:15	2025-12-09 10:05:15.342	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 12:05:15.342919	2025-12-09 12:05:15.342919	0.00	\N
23294fed-1a3a-4e2b-9681-519dd4462748	KU251209-0019	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-09	15:27:05	2025-12-09 13:27:05.191	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 15:27:05.192358	2025-12-09 15:27:05.192358	0.00	\N
f5d5ac1d-14c9-46d7-9349-4248d0defb41	KU251209-0018	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-09	13:35:00	2025-12-09 13:46:19.595	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 13:35:00.612936	2025-12-09 15:46:19.596584	0.00	\N
239b7f1c-f143-43a9-94b7-00dd2e34a9ca	KU251209-0021	ed27f8db-83f3-4dd7-ab16-5c315c233794	53e3741b-51ee-4d66-9f6b-33ecabd8b463	250.00	USD	CASH	PAID	2025-12-09	16:23:24	2025-12-09 14:23:24.7	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 16:23:24.701286	2025-12-09 16:23:24.701286	0.00	\N
85ced1a2-80ce-47fb-85eb-158b53ec1bde	KU251209-0020	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-09	15:47:30	2025-12-09 13:47:30.839	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	ENTRY TODAY	2025-12-10 07:20:17.07778	2025-12-09 15:47:30.841152	2025-12-10 07:20:17.07778	0.00	\N
c1db203e-5725-4de1-a99b-213cbdb5448a	KU251210-0001	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-10	07:20:35	2025-12-10 05:20:35.594	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-10 07:20:35.59513	2025-12-10 07:20:35.59513	0.00	\N
b4c17ce7-5630-408e-9ebc-64d86f8079c0	KU251210-0003	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	900.00	USD	CASH	PAID	2025-12-10	09:39:20	2025-12-10 07:39:20.825	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-10 09:39:20.827949	2025-12-10 09:39:20.827949	0.00	\N
20316055-7f06-48e3-aa7c-6eb07064b29f	KU251209-0007	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	3000.00	USD	CASH	PAID	2025-12-09	09:54:36	2025-12-10 07:47:13.66	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 09:54:36.059604	2025-12-10 09:47:13.661867	0.00	\N
aa5985b9-5966-42e1-9301-ebd428b1d39b	KU251209-0015	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-09	12:10:01	2025-12-10 07:47:31.171	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 12:10:01.334019	2025-12-10 09:47:31.173218	0.00	\N
48872774-4aed-4255-9cbb-1073058463dc	KU251209-0016	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-09	12:43:12	2025-12-10 07:47:40.882	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 12:43:12.303268	2025-12-10 09:47:40.883779	0.00	\N
4cb2aa7c-d063-4afe-bfa1-ac5bb1e90a07	KU251209-0017	3fc16d1d-5a89-4ce8-a1c4-67cc031845f7	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-09	13:16:51	2025-12-10 07:47:49.316	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 13:16:51.788061	2025-12-10 09:47:49.318433	0.00	\N
50aeb8da-8512-4cce-9fba-fb64bcc2ac9d	KU251209-0022	c21e9a75-8949-49c2-b2c9-ff6c316fae26	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-09	16:28:00	2025-12-10 07:47:59.6	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 16:28:00.197169	2025-12-10 09:47:59.602151	0.00	\N
1384dedd-06aa-420d-882b-19bd7cb0a0a9	KU251209-0023	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	3000.00	USD	CASH	PAID	2025-12-09	16:29:08	2025-12-10 07:48:10.082	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-09 16:29:08.705798	2025-12-10 09:48:10.083535	0.00	\N
013f986e-d0c6-4088-b698-f78f367f3155	KU251205-0007	86b93c70-e8e1-4bce-8182-c626b082b8bf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	10000.00	USD	CASH	PAID	2025-12-05	10:27:23	2025-12-10 07:48:54.764	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-05 10:27:23.197529	2025-12-10 09:48:54.765666	0.00	\N
9b60ff93-ff00-49a9-b3b0-be97af3e4580	KU251210-0005	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-10	10:02:30	2025-12-10 08:02:30.633	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-10 10:02:30.634515	2025-12-10 10:02:30.634515	0.00	\N
90c478b4-a0a4-4fd6-afe5-179ef5d7776a	KU251210-0008	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	53e3741b-51ee-4d66-9f6b-33ecabd8b463	100.00	USD	CASH	PAID	2025-12-10	11:00:50	2025-12-10 09:00:50.724	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-10 11:00:50.726921	2025-12-10 11:00:50.726921	0.00	\N
6bd26646-3120-41d3-bc3d-fb21efe0d2ac	KU251210-0007	86b93c70-e8e1-4bce-8182-c626b082b8bf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	10000.00	USD	CASH	PAID	2025-12-10	10:59:27	2025-12-10 08:59:27.097	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	PANDING	2025-12-10 11:04:24.97596	2025-12-10 10:59:27.099987	2025-12-10 11:04:24.97596	0.00	\N
8cefc252-f9ea-42fa-b519-7ec86a825a05	KU251210-0013	40d63f00-ddc5-4f8c-aa25-cd57c5e237de	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-10	13:18:43	2025-12-10 11:18:43.184	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-10 13:18:43.187028	2025-12-10 13:18:43.187028	0.00	\N
f1f30d21-842b-4508-864f-f05db5d3c3a2	KU251210-0014	3aefd7d8-f08a-40f7-a105-c2d0d15b1083	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-10	13:50:34	2025-12-10 11:50:34.557	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-10 13:50:34.558443	2025-12-10 13:50:34.558443	0.00	\N
307c7b00-4bec-4178-8dea-91e62e08bc96	KU251211-0003	7136d6c5-245b-421b-9bbb-84c637cf1577	53e3741b-51ee-4d66-9f6b-33ecabd8b463	250.00	USD	CASH	PAID	2025-12-11	11:01:21	2025-12-11 09:01:21.913	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-11 11:01:21.915981	2025-12-11 11:01:21.915981	0.00	\N
be7bfda7-8f19-441c-bee8-aca26e41a6ef	KU251211-0002	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PENDING	2025-12-11	09:58:54	\N	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	DUBLACT	2025-12-11 11:21:05.286538	2025-12-11 09:58:54.2135	2025-12-11 11:21:05.286538	0.00	\N
5114dc52-61fe-49d9-b6ac-d1b0f1e51308	KU251211-0007	e8085a42-1018-435a-b5f8-6ec0f4f6d9b2	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-11	11:51:38	2025-12-11 09:51:38.903	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-11 11:51:38.905072	2025-12-11 11:51:38.905072	0.00	\N
45ce172f-73b2-4a57-9705-fe094602c815	KU251210-0002	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	250.00	USD	CASH	PAID	2025-12-10	07:24:06	2025-12-11 10:25:40.912	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-10 07:24:06.599152	2025-12-11 12:25:40.913473	0.00	\N
6fddac48-abe4-4e6b-b026-59a82d8bf223	KU251210-0010	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	3000.00	USD	CASH	PAID	2025-12-10	11:28:44	2025-12-11 10:25:55.847	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-10 11:28:44.99587	2025-12-11 12:25:55.848892	0.00	\N
87dbff31-7010-4a76-8b2a-4a2a2b49dc04	KU251210-0011	dba747bc-6b58-44b5-9c5a-88376604bf41	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-10	11:30:12	2025-12-11 10:26:03.741	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-10 11:30:12.412783	2025-12-11 12:26:03.742578	0.00	\N
46f1d2e8-4674-4662-a8ae-28f3a4bfe7a7	KU251210-0012	f925cb0f-5b64-4efa-aa01-f58f2aa7b5f1	53e3741b-51ee-4d66-9f6b-33ecabd8b463	290.00	USD	CASH	PAID	2025-12-10	12:08:04	2025-12-11 10:26:22.424	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-10 12:08:04.164578	2025-12-11 12:26:22.425329	0.00	\N
7b51dd0e-4d21-4f9d-be43-0c4b2ea80f0b	KU251210-0006	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-10	10:42:18	2025-12-11 11:02:54.815	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-10 10:42:18.498729	2025-12-11 13:02:54.816649	0.00	\N
73e6a1f0-a99b-46fa-9c09-029f416fba76	KU251211-0008	970181ef-e333-4707-b74c-f6818f947fd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-11	11:55:39	2025-12-11 12:39:33.812	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-11 11:55:39.486293	2025-12-11 14:39:33.813304	0.00	\N
1178a7f0-08aa-495d-87da-c166dc321bce	KU251211-0004	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	3000.00	USD	CASH	PAID	2025-12-11	11:09:25	2025-12-12 07:22:18.782	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-11 11:09:25.650361	2025-12-12 09:22:18.7838	0.00	\N
e6d100c1-e594-4f81-a868-818f061ee9d7	KU251211-0005	c21e9a75-8949-49c2-b2c9-ff6c316fae26	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-11	11:10:39	2025-12-12 07:22:34.239	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-11 11:10:39.033546	2025-12-12 09:22:34.240953	0.00	\N
76c3f261-d070-4c80-be8a-311d00e47dcf	KU251210-0009	86b93c70-e8e1-4bce-8182-c626b082b8bf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	10000.00	USD	CASH	PAID	2025-12-10	11:05:44	2025-12-12 07:35:35.699	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-10 11:05:44.828996	2025-12-12 09:35:35.70099	0.00	\N
2c3d77c9-6c1b-4524-8c77-ff839e94fc5b	KU251211-0001	6fc69780-b82a-415c-8022-dbe458b200d9	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-11	09:33:01	2025-12-12 09:20:16.541	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-11 09:33:01.630263	2025-12-12 11:20:16.541744	0.00	\N
60dab686-1f61-4ff0-8c24-eafbb7402fef	KU251210-0004	970181ef-e333-4707-b74c-f6818f947fd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PAID	2025-12-10	10:00:16	2025-12-11 10:00:45.056	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-10 10:00:16.24728	2025-12-11 12:00:45.057727	0.00	\N
5f7600d6-6adb-4e49-bf48-0e19c60cf1bd	KU251211-0009	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-11	12:50:16	2025-12-11 10:50:16.3	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-11 12:50:16.302747	2025-12-11 12:50:16.302747	0.00	\N
d94b0d4d-b174-431c-9f44-c780ac3de1b7	KU251211-0010	0f29f61e-5381-4140-bd0a-3c650583b0aa	53e3741b-51ee-4d66-9f6b-33ecabd8b463	420.00	USD	CASH	PAID	2025-12-11	12:55:36	2025-12-11 10:55:36.21	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-11 12:55:36.212697	2025-12-11 12:55:36.212697	0.00	\N
1aeba071-3325-47aa-ba6b-5c809a758508	KU251211-0011	cc21613a-e018-4958-b1f3-ba046afe9d5e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	250.00	USD	CASH	PAID	2025-12-11	13:24:32	2025-12-11 11:24:32.279	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-11 13:24:32.280573	2025-12-11 13:24:32.280573	0.00	\N
48db5386-47be-4c49-8aa1-1fd7aae04c38	KU251211-0012	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1300.00	USD	CASH	PAID	2025-12-11	13:25:25	2025-12-11 11:25:25.727	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-11 13:25:25.728453	2025-12-11 13:25:25.728453	0.00	\N
b81daa91-187c-42a7-bbd9-3c0a207b586f	KU251211-0015	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-11	14:38:24	2025-12-11 12:38:24.949	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	NOT CASH	2025-12-11 14:38:53.148254	2025-12-11 14:38:24.952165	2025-12-11 14:38:53.148254	0.00	\N
69384566-9379-4804-9bff-5ecb6e2ec3d9	KU251211-0017	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-11	14:55:26	2025-12-11 12:55:26.277	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-11 14:55:26.28001	2025-12-11 14:55:26.28001	0.00	\N
7cbe62c5-535f-4105-9b7d-11811a2fd41c	KU251211-0019	e21cbb1d-137a-4ed8-b5e4-00e828e9f278	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1200.00	USD	CASH	PAID	2025-12-11	15:48:16	2025-12-11 13:48:16.913	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-11 15:48:16.916055	2025-12-11 15:48:16.916055	0.00	\N
330fccf6-01f9-47bf-84ca-4ce0918f3e25	KU251212-0002	40d63f00-ddc5-4f8c-aa25-cd57c5e237de	53e3741b-51ee-4d66-9f6b-33ecabd8b463	290.00	USD	CASH	PAID	2025-12-12	09:15:42	2025-12-12 07:15:42.418	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-12 09:15:42.420865	2025-12-12 09:15:42.420865	0.00	\N
a6473d1e-e1d6-4b35-a425-d68a1cb1d343	KU251212-0003	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-12	09:18:44	2025-12-12 07:18:44.335	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-12 09:18:44.337233	2025-12-12 09:18:44.337233	0.00	\N
53a5ce5c-f589-4334-b2d8-4a6118c5731d	KU251211-0022	6bbc4e6f-aac0-43fc-8235-82d517012bba	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1200.00	USD	CASH	PAID	2025-12-11	15:57:00	2025-12-12 07:23:18.351	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-11 15:57:00.93529	2025-12-12 09:23:18.35289	0.00	\N
a44a473a-4d6a-47de-874f-b3a6ee3aa377	KU251211-0020	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	3000.00	USD	CASH	PAID	2025-12-11	15:50:10	2025-12-12 07:26:21.918	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-11 15:50:10.706795	2025-12-12 09:26:21.920337	0.00	\N
5db57966-82c7-445a-a6d1-025a1f8eb2e4	KU251211-0021	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-11	15:51:26	2025-12-12 07:33:17.776	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-11 15:51:26.734794	2025-12-12 09:33:17.777381	0.00	\N
6f039fbd-fb4b-434f-a1a5-ca332921c7e5	KU251212-0004	c846fd1b-0329-49dd-be3f-536732398bdf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	640.00	USD	CASH	PAID	2025-12-12	09:37:07	2025-12-12 07:37:07.946	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-12 09:37:07.948574	2025-12-12 09:37:07.948574	0.00	\N
4a150d9f-1205-40a0-814a-7a57795bf944	KU251212-0005	211317cb-7002-4abc-8350-ea60cd33dcd7	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-12	09:38:34	2025-12-12 07:38:34.184	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-12 09:38:34.186973	2025-12-12 09:38:34.186973	0.00	\N
15450f4f-01b6-469d-95c0-bf4d14106f73	KU251212-0006	6bbc4e6f-aac0-43fc-8235-82d517012bba	53e3741b-51ee-4d66-9f6b-33ecabd8b463	100.00	USD	CASH	PAID	2025-12-12	09:45:40	2025-12-12 07:45:40.496	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-12 09:45:40.498418	2025-12-12 09:45:40.498418	0.00	\N
d44177bd-3118-49bc-88d5-e9c3b1833154	KU251212-0008	0f639da7-b8ae-4671-a1ce-d66c76169567	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-12	09:47:11	2025-12-12 07:47:11.57	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-12 09:47:11.572794	2025-12-12 09:47:11.572794	0.00	\N
2a573fed-d1af-4196-beea-bf913c165fcc	KU251211-0023	d9fedfe6-0d89-49fe-b06c-97529354a88c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-11	18:07:08	2025-12-12 08:15:47.253	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-11 18:07:08.432743	2025-12-12 10:15:47.257732	0.00	\N
a9044dc0-cdc6-4832-a97e-999a327931f0	KU251212-0009	ee3455fe-2bf7-487c-8e25-e2dc57b63d3d	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1060.00	USD	CASH	PAID	2025-12-12	10:42:15	2025-12-12 08:42:15.654	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-12 10:42:15.656813	2025-12-12 10:42:15.656813	0.00	\N
505b9a12-5c50-4329-a666-0e38baaee864	KU251212-0010	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	53e3741b-51ee-4d66-9f6b-33ecabd8b463	800.00	USD	CASH	PAID	2025-12-12	10:44:54	2025-12-12 08:44:54.155	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-12 10:44:54.156782	2025-12-12 10:44:54.156782	0.00	\N
3e4471c9-8b7c-4686-943e-f67a67195758	KU251212-0011	6fc69780-b82a-415c-8022-dbe458b200d9	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-12	11:20:52	2025-12-12 09:20:52.646	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-12 11:20:52.647253	2025-12-12 11:20:52.647253	0.00	\N
ffac05ea-05c4-4cc5-b29d-e269a122aa1c	KU251212-0012	48c75540-955e-4fa8-a024-b61780e4e248	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-12	11:52:43	2025-12-12 09:52:43.918	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-12 11:52:43.918972	2025-12-12 11:52:43.918972	0.00	\N
cf43271a-6601-4be1-9d67-1e78f8601149	KU251212-0013	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-12	13:09:07	2025-12-12 11:09:07.583	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-12 13:09:07.588794	2025-12-12 13:09:07.588794	0.00	\N
5536465c-e279-41e8-8991-2524837a09a3	KU251212-0016	4bcc794f-86b2-44aa-880c-66967e906df3	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-12	14:05:43	2025-12-12 12:05:43.716	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-12 14:05:43.717154	2025-12-12 14:05:43.717154	0.00	\N
2df78977-8f7a-44d3-9ec1-cb30c20d2796	KU251211-0018	970181ef-e333-4707-b74c-f6818f947fd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-11	15:10:19	2025-12-12 13:43:36.907	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-11 15:10:19.961077	2025-12-12 15:43:36.906013	0.00	\N
874cc01b-0a1b-4e45-a381-b472dc890420	KU251212-0017	b54aa6a7-6276-48fc-a282-5a097f870f33	53e3741b-51ee-4d66-9f6b-33ecabd8b463	310.00	USD	CASH	PAID	2025-12-12	15:46:02	2025-12-12 13:46:02.441	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-12 15:46:02.442395	2025-12-12 15:46:02.442395	0.00	\N
6d1e980f-03fc-4894-82fb-b39ce983ac38	KU251213-0001	0f639da7-b8ae-4671-a1ce-d66c76169567	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-13	09:15:22	2025-12-13 07:15:22.7	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-13 09:15:22.700822	2025-12-13 09:15:22.700822	0.00	\N
78577aa8-3543-4c19-93a9-a16abc704ae5	KU251213-0002	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	3000.00	USD	CASH	PAID	2025-12-13	09:16:23	2025-12-13 07:16:23.447	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-13 09:16:23.447646	2025-12-13 09:16:23.447646	0.00	\N
8e2df06c-d449-477f-a612-5330d8f11ad1	KU251213-0004	bd7c75e3-931e-48e2-9da1-7e0655e8299b	53e3741b-51ee-4d66-9f6b-33ecabd8b463	800.00	USD	CASH	PAID	2025-12-13	09:57:02	2025-12-13 07:57:02.983	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-13 09:57:02.984141	2025-12-13 09:57:02.984141	0.00	\N
075dc441-7585-425d-9fe6-ef6630953205	KU251213-0005	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	53e3741b-51ee-4d66-9f6b-33ecabd8b463	700.00	USD	CASH	PAID	2025-12-13	09:58:02	2025-12-13 07:58:02.583	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-13 09:58:02.584614	2025-12-13 09:58:02.584614	0.00	\N
bc0937e1-f9e6-4297-9275-a9eeda619107	KU251212-0015	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-12	13:58:12	2025-12-13 08:36:44.909	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-12 13:58:12.46792	2025-12-13 10:36:44.909511	0.00	\N
a539299b-de57-4169-a8bd-fef28bf7259a	KU251212-0007	6bbc4e6f-aac0-43fc-8235-82d517012bba	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-12	09:46:49	2025-12-13 08:38:21.45	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-12 09:46:49.470177	2025-12-13 10:38:21.450601	0.00	\N
0e249d7c-22d3-497b-b611-4ed7aa63d75d	KU251211-0016	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-11	14:39:06	2025-12-13 10:19:14.038	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-11 14:39:06.97295	2025-12-13 12:19:14.039811	0.00	\N
c3c037eb-0912-496a-a791-4569be36f698	KU251213-0003	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	600.00	USD	CASH	PAID	2025-12-13	09:17:16	2025-12-14 08:09:33.615	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-13 09:17:16.470308	2025-12-14 10:09:33.615969	0.00	\N
81bc1da8-ae49-4e24-93b8-eb76a20395f1	KU251211-0013	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	390.00	USD	CASH	PAID	2025-12-11	13:25:41	2025-12-15 08:25:15.831	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-11 13:25:41.02287	2025-12-15 10:25:15.831729	0.00	\N
3ba80759-1683-49cf-b40e-4b1b543fdc9e	KU251211-0014	86b93c70-e8e1-4bce-8182-c626b082b8bf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	10000.00	USD	CASH	PAID	2025-12-11	14:28:02	2025-12-15 11:02:34.367	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-11 14:28:02.54372	2025-12-15 13:02:34.369917	0.00	\N
5a32da3c-a4d3-4f85-8575-09a32662b3d9	KU251212-0014	970181ef-e333-4707-b74c-f6818f947fd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-12	13:36:46	2025-12-20 10:34:26.522	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-12 13:36:46.962184	2025-12-20 12:34:26.523262	0.00	\N
b1a0b2ea-16bf-4f15-94ea-eb423041434f	KU251213-0007	dc685389-b46b-488f-b903-fc8d4743043b	53e3741b-51ee-4d66-9f6b-33ecabd8b463	3800.00	USD	CASH	PAID	2025-12-13	10:10:30	2025-12-13 08:10:30.026	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-13 10:10:30.026784	2025-12-13 10:10:30.026784	0.00	\N
553a8934-ccba-46ed-82c8-2f673785b170	KU251213-0008	cb7b9deb-3a42-46e4-ac5a-b1440c346f66	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-13	10:13:12	2025-12-13 08:13:12.861	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-13 10:13:12.862356	2025-12-13 10:13:12.862356	0.00	\N
94c0ba2e-3dc9-4df1-970f-db370f6a4391	KU251213-0009	d9fedfe6-0d89-49fe-b06c-97529354a88c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-13	10:31:03	2025-12-13 08:31:03.752	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-13 10:31:03.753197	2025-12-13 10:31:03.753197	0.00	\N
597330fe-87cf-458e-b403-4e5efdac33c1	KU251212-0001	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-12	08:17:37	2025-12-13 08:36:25.295	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-12 08:17:37.362993	2025-12-13 10:36:25.295908	0.00	\N
70f58ba0-b39c-4ffc-90c5-21d373dd4820	KU251213-0010	5515cbf4-6ee1-435a-aeb4-5e433cc31cd0	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-13	10:43:36	2025-12-13 08:43:36.438	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-13 10:43:36.439553	2025-12-13 10:43:36.439553	0.00	\N
f4a8b9ca-7cf6-4e4f-8026-a843a8d4b03b	KU251213-0011	4409d9cb-e256-4088-99ee-8a257cac99bf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-13	11:00:09	2025-12-13 09:00:09.403	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-13 11:00:09.404266	2025-12-13 11:00:09.404266	0.00	\N
0b2798e3-05c1-420e-b988-ab1114af0355	KU251213-0013	e9457736-1c31-4b00-a9ed-c888aca31f2e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-13	13:13:52	2025-12-13 11:13:52.35	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-13 13:13:52.351676	2025-12-13 13:13:52.351676	0.00	\N
cf8c27b9-0b77-489f-a31c-4335ab914deb	KU251213-0015	0f639da7-b8ae-4671-a1ce-d66c76169567	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-13	13:53:19	2025-12-13 11:53:19.348	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-13 13:53:19.349639	2025-12-13 13:53:19.349639	0.00	\N
845aed5f-516d-41e1-8207-18bc06f97087	KU251213-0016	4be0e1ae-b1c7-42fd-b2d1-1ae7ffc7e31e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	450.00	USD	CASH	PAID	2025-12-13	14:25:39	2025-12-13 12:25:39.886	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-13 14:25:39.888122	2025-12-13 14:25:39.888122	0.00	\N
c8456e79-c052-4800-8dea-080a10b68413	KU251123-0003	970181ef-e333-4707-b74c-f6818f947fd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-11-23	12:36:15	2025-12-13 12:29:19.664	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-11-23 12:36:15.39791	2025-12-13 14:29:19.665096	100.00	400.00
3f58c624-96a3-4e8f-8c26-db83c0dd02da	KU251213-0017	84852b83-ffcb-411d-be4b-3c194a999d68	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-13	15:03:08	2025-12-13 13:03:08.725	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-13 15:03:08.726494	2025-12-13 15:03:08.726494	0.00	\N
c31261c5-c127-4f86-b5f0-99d6bf5357ca	KU251213-0018	dba747bc-6b58-44b5-9c5a-88376604bf41	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-13	15:42:34	2025-12-13 13:42:34.717	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-13 15:42:34.71822	2025-12-13 15:42:34.71822	0.00	\N
d8738aa1-17c7-4135-8b49-9ce7d831810b	KU251213-0019	60fb4144-ba84-48b6-940c-b5fb58bd0ee7	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-13	15:47:11	2025-12-13 13:47:11.674	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-13 15:47:11.683512	2025-12-13 15:47:11.683512	0.00	\N
b94916fa-b734-4350-96ec-e3b1dc8c194f	KU251213-0021	211317cb-7002-4abc-8350-ea60cd33dcd7	53e3741b-51ee-4d66-9f6b-33ecabd8b463	750.00	USD	CASH	PAID	2025-12-13	16:05:08	2025-12-14 07:56:20.259	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-13 16:05:08.215844	2025-12-14 09:56:20.260055	0.00	\N
b8239a79-098f-4a61-83b7-b51865b37b5d	KU251213-0020	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-13	15:50:02	2025-12-14 07:56:31.206	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-13 15:50:02.711035	2025-12-14 09:56:31.207336	0.00	\N
e15e9e48-8e8a-4212-a566-6fcc6d33489c	KU251213-0014	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2500.00	USD	CASH	PAID	2025-12-13	13:45:57	2025-12-14 07:56:42.508	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-13 13:45:57.632665	2025-12-14 09:56:42.509294	0.00	\N
c159ff15-64b9-4e6b-99bd-8d4a0db58e05	KU251213-0012	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-13	12:19:36	2025-12-14 07:56:49.092	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-13 12:19:36.966581	2025-12-14 09:56:49.093179	0.00	\N
8120b731-6564-40ba-9e5b-60113329acdb	KU251213-0006	f925cb0f-5b64-4efa-aa01-f58f2aa7b5f1	53e3741b-51ee-4d66-9f6b-33ecabd8b463	260.00	USD	CASH	PAID	2025-12-13	10:07:52	2025-12-14 07:58:34.532	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-13 10:07:52.25817	2025-12-14 09:58:34.533237	0.00	\N
965d8a1c-cbdc-4e54-a871-bbd96d8001f4	KU251215-0003	9f7b27a4-b866-4e8f-9138-c385cf2b4f0c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-15	09:25:39	2025-12-15 07:25:39.539	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-15 09:25:39.54179	2025-12-15 09:25:39.54179	0.00	\N
0b54f69d-dd64-461e-af3f-281b9f0f9ef9	KU251215-0002	d9fedfe6-0d89-49fe-b06c-97529354a88c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1500.00	USD	CASH	PAID	2025-12-15	09:25:24	2025-12-15 07:38:18.976	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-15 09:25:24.042959	2025-12-15 09:38:18.979116	0.00	\N
ef7387c1-0a29-4ffb-91c0-b167ea82d6f1	KU251214-0001	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-14	10:17:37	2025-12-15 07:46:25.627	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-14 10:17:37.879802	2025-12-15 09:46:25.629284	0.00	\N
ec5abc41-3461-444a-9e72-cf6dec8202ba	KU251214-0002	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-14	10:17:55	2025-12-15 07:46:32.358	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-14 10:17:55.81037	2025-12-15 09:46:32.359545	0.00	\N
b1881775-2772-4553-9de1-d34b7a68cba6	KU251214-0003	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1500.00	USD	CASH	PAID	2025-12-14	10:18:10	2025-12-15 07:46:38.59	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-14 10:18:10.797345	2025-12-15 09:46:38.591413	0.00	\N
80c72b41-be4c-4fac-bf9e-01f81190e848	KU251215-0004	dd35069f-40bd-423b-9b0a-edc6781db7a5	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-15	10:02:57	2025-12-15 08:02:57.982	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-15 10:02:57.98548	2025-12-15 10:02:57.98548	0.00	\N
0d8d4644-1922-47e0-af6d-3e86c35165b5	KU251215-0005	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-15	10:06:00	2025-12-15 08:06:00.624	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-15 10:06:00.625759	2025-12-15 10:06:00.625759	0.00	\N
9315ec2c-abae-4e00-87a0-60c093ae5fa9	KU251215-0007	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1500.00	USD	CASH	PAID	2025-12-15	10:27:34	2025-12-15 08:27:34.397	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-15 10:27:34.399686	2025-12-15 10:27:34.399686	0.00	\N
daf2cd59-b945-42bc-aef5-416cf5d97c5c	KU251215-0008	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-15	10:28:39	2025-12-15 08:28:39.924	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-15 10:28:39.926881	2025-12-15 10:28:39.926881	0.00	\N
c5e5ac23-b1cf-4f2c-a9c3-fee4915fa999	KU251215-0009	9f7b27a4-b866-4e8f-9138-c385cf2b4f0c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-15	10:35:39	2025-12-15 08:35:39.146	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-15 10:35:39.148778	2025-12-15 10:35:39.148778	0.00	\N
5531db4a-6386-493c-9511-9aecd53cd49c	KU251215-0011	cc21613a-e018-4958-b1f3-ba046afe9d5e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	140.00	USD	CASH	PAID	2025-12-15	10:43:23	2025-12-15 08:43:23.03	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-15 10:43:23.032556	2025-12-15 10:43:23.032556	0.00	\N
b85adcac-62c8-4e07-ba20-ac8c13d0bb38	KU251215-0012	2b89c467-e4b0-419f-9ade-f42a777264db	53e3741b-51ee-4d66-9f6b-33ecabd8b463	900.00	USD	CASH	PAID	2025-12-15	11:34:46	2025-12-15 09:34:46.685	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-15 11:34:46.688174	2025-12-15 11:34:46.688174	0.00	\N
7fe7e8b5-17e4-4017-b6ca-3d9bd1336b5b	KU251215-0015	3276bf6c-e1cc-4791-9e0d-44d6a9966ba4	53e3741b-51ee-4d66-9f6b-33ecabd8b463	120.00	USD	CASH	PAID	2025-12-15	11:43:41	2025-12-15 09:43:41.316	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-15 11:43:41.317816	2025-12-15 11:43:41.317816	0.00	\N
54cb4887-d44d-4a6b-9c58-d435646eda00	KU251215-0001	c21e9a75-8949-49c2-b2c9-ff6c316fae26	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-15	09:25:08	2025-12-16 07:02:15.848	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-15 09:25:08.188789	2025-12-16 09:02:15.84848	0.00	\N
084260b6-8279-4945-822c-505e0015e756	KU251215-0013	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	3800.00	USD	CASH	PAID	2025-12-15	11:39:02	2025-12-16 07:02:33.953	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-15 11:39:02.354326	2025-12-16 09:02:33.954648	0.00	\N
1be65397-82ad-4beb-a9d3-cf0f6bee4a7a	KU251215-0014	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	800.00	USD	CASH	PAID	2025-12-15	11:40:06	2025-12-16 07:02:41.22	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-15 11:40:06.131703	2025-12-16 09:02:41.222127	0.00	\N
7ea45c8c-c67b-4458-bfb2-ea858f3c5628	KU251214-0004	c846fd1b-0329-49dd-be3f-536732398bdf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	490.00	USD	CASH	PENDING	2025-12-14	10:18:46	\N	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	closed acont	2025-12-16 12:05:18.908278	2025-12-14 10:18:46.500991	2025-12-16 12:05:18.908278	0.00	\N
10df07a2-f3be-441c-9c9d-0155c276e6f1	KU251215-0010	970181ef-e333-4707-b74c-f6818f947fd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-15	10:41:52	2025-12-16 11:41:08.513	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-15 10:41:52.688191	2025-12-16 13:41:08.514142	0.00	\N
db6b0101-e700-48e4-91d8-9975a28c59fe	KU251215-0006	86b93c70-e8e1-4bce-8182-c626b082b8bf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	10000.00	USD	CASH	PAID	2025-12-15	10:10:52	2025-12-17 11:18:56.818	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-15 10:10:52.974854	2025-12-17 13:18:56.818691	0.00	\N
ec923707-a1ef-4514-b987-fe9b82c220dd	KU251215-0016	e21cbb1d-137a-4ed8-b5e4-00e828e9f278	53e3741b-51ee-4d66-9f6b-33ecabd8b463	560.00	USD	CASH	PAID	2025-12-15	13:08:00	2025-12-15 11:08:00.26	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-15 13:08:00.263952	2025-12-15 13:08:00.263952	0.00	\N
be63faf8-4dc4-4cd6-824a-efc68587e8c5	KU251215-0017	8264a667-ae81-48b9-84fd-d795f170737c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-15	13:16:40	2025-12-15 11:16:40.122	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-15 13:16:40.125769	2025-12-15 13:16:40.125769	0.00	\N
31448bc3-75a0-46e4-819f-0d00a1537799	KU251214-0005	0f639da7-b8ae-4671-a1ce-d66c76169567	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-14	10:19:39	2025-12-15 12:02:58.762	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-14 10:19:39.507418	2025-12-15 14:02:58.76346	0.00	\N
ca6c74de-cd3e-44a1-9dc7-28370d125cd0	KU251215-0020	8264a667-ae81-48b9-84fd-d795f170737c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	350.00	USD	CASH	PAID	2025-12-15	16:33:56	2025-12-15 14:33:56.209	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-15 16:33:56.215311	2025-12-15 16:33:56.215311	0.00	\N
04cdd959-e6f7-45c8-8de9-a5b028c9aee4	KU251216-0001	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-16	08:53:59	2025-12-16 06:53:59.316	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-16 08:53:59.318306	2025-12-16 08:53:59.318306	0.00	\N
d02de114-12bb-4e06-a405-43f052788b84	KU251215-0019	c21e9a75-8949-49c2-b2c9-ff6c316fae26	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-15	14:22:17	2025-12-16 07:02:56.037	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-15 14:22:17.583195	2025-12-16 09:02:56.039789	0.00	\N
ec1df787-384f-4214-8f44-77131a536a66	KU251216-0002	3276bf6c-e1cc-4791-9e0d-44d6a9966ba4	53e3741b-51ee-4d66-9f6b-33ecabd8b463	130.00	USD	CASH	PAID	2025-12-16	09:12:24	2025-12-16 07:12:24.629	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-16 09:12:24.630782	2025-12-16 09:12:24.630782	0.00	\N
a79a3881-7582-4ab2-a65b-407eae1e1867	KU251216-0003	dc685389-b46b-488f-b903-fc8d4743043b	53e3741b-51ee-4d66-9f6b-33ecabd8b463	4000.00	USD	CASH	PAID	2025-12-16	09:40:12	2025-12-16 07:40:12.345	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-16 09:40:12.348062	2025-12-16 09:40:12.348062	0.00	\N
19be28b6-818f-48f1-82e9-560501b7cd3c	KU251216-0005	9f7b27a4-b866-4e8f-9138-c385cf2b4f0c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-16	10:54:31	2025-12-16 08:54:31.266	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-16 10:54:31.267013	2025-12-16 10:54:31.267013	0.00	\N
832512df-83b3-4301-8908-669d462602c0	KU251216-0006	a8eb6611-3c8e-4b67-a269-68033e418688	53e3741b-51ee-4d66-9f6b-33ecabd8b463	600.00	USD	CASH	PAID	2025-12-16	11:23:08	2025-12-16 09:23:08.752	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-16 11:23:08.75474	2025-12-16 11:23:08.75474	0.00	\N
6ff87b7b-0803-4e44-a871-b2cd10ff4d6d	KU251216-0007	4be0e1ae-b1c7-42fd-b2d1-1ae7ffc7e31e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	250.00	USD	CASH	PAID	2025-12-16	11:33:52	2025-12-16 09:33:52.921	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-16 11:33:52.923779	2025-12-16 11:33:52.923779	0.00	\N
de3243c6-ad17-4fe8-8c96-4c7b851dda83	KU251216-0009	8e34184e-2091-4691-a5dc-329a22d316e9	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-16	12:37:35	2025-12-16 10:37:35.477	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-16 12:37:35.478295	2025-12-16 12:37:35.478295	0.00	\N
54dc9cca-05f9-43bb-aa20-a6e00021a097	KU251216-0010	61c18c87-f840-43d5-91ea-0c9c54a80040	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-16	12:38:11	2025-12-16 10:38:11.562	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-16 12:38:11.564576	2025-12-16 12:38:11.564576	0.00	\N
de245d6f-01e5-42d7-805c-396986f2818d	KU251216-0012	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-16	13:46:03	2025-12-16 11:46:03.833	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-16 13:46:03.835629	2025-12-16 13:46:03.835629	0.00	\N
5ef98eff-897f-407b-8e4e-349ba55ed6cc	KU251215-0018	1602c2a5-5908-4cbf-b14a-73d18ffafbd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-15	14:16:00	2025-12-16 12:19:01.584	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-15 14:16:00.584459	2025-12-16 14:19:01.584512	0.00	\N
586258dc-f6b9-4161-8a69-c23c4ea234f2	KU251216-0015	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	3000.00	USD	CASH	PAID	2025-12-16	14:27:30	2025-12-16 12:27:30.564	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-16 14:27:30.565121	2025-12-16 14:27:30.565121	0.00	\N
1a6234a3-1950-4e52-8612-2be8b2c98c68	KU251216-0016	81642bfc-31dc-49bf-9008-2a4fa2babe4e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-16	14:57:01	2025-12-16 12:57:01.339	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-16 14:57:01.339766	2025-12-16 14:57:01.339766	0.00	\N
68de28a4-8590-414a-873f-2c212e00f273	KU251216-0017	3aefd7d8-f08a-40f7-a105-c2d0d15b1083	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-16	15:07:42	2025-12-16 13:07:42.258	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-16 15:07:42.258976	2025-12-16 15:07:42.258976	0.00	\N
c8ec01e2-3d92-4a31-b343-92dcfb688add	KU251216-0018	e5637070-3483-46e6-9b4f-5e03c1f1d211	53e3741b-51ee-4d66-9f6b-33ecabd8b463	510.00	USD	CASH	PAID	2025-12-16	15:18:33	2025-12-16 13:18:33.111	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-16 15:18:33.111585	2025-12-16 15:18:33.111585	0.00	\N
8fc2f2ef-53c6-44cb-952a-83c215a755ba	KU251216-0019	bd7755a6-ba4f-474c-a854-5857acb022a3	53e3741b-51ee-4d66-9f6b-33ecabd8b463	100.00	USD	CASH	PAID	2025-12-16	15:39:06	2025-12-16 13:39:06.629	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-16 15:39:06.632055	2025-12-16 15:39:06.632055	0.00	\N
eb6666b3-646a-413c-8d8c-e0347a656665	KU251216-0020	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-16	16:14:03	2025-12-16 14:14:03.889	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-16 16:14:03.89239	2025-12-16 16:14:03.89239	0.00	\N
8c7ae9ec-bee2-4df3-a029-8173d004ed1f	KU251216-0021	e21cbb1d-137a-4ed8-b5e4-00e828e9f278	53e3741b-51ee-4d66-9f6b-33ecabd8b463	260.00	USD	CASH	PAID	2025-12-16	16:15:42	2025-12-16 14:15:42.47	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-16 16:15:42.476233	2025-12-16 16:15:42.476233	0.00	\N
6d6470b0-dcc1-4b63-887b-1d7af77939c8	KU251217-0001	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-17	08:56:07	2025-12-17 06:56:07.724	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-17 08:56:07.725681	2025-12-17 08:56:07.725681	0.00	\N
8fca3346-5225-48d2-95aa-d150af772b86	KU251217-0002	3aefd7d8-f08a-40f7-a105-c2d0d15b1083	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-17	09:41:04	2025-12-17 07:41:04.199	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-17 09:41:04.20027	2025-12-17 09:41:04.20027	0.00	\N
c0d751e0-f5d6-4165-b136-a572a9cf1f02	KU251217-0005	92988962-c192-4f5c-8cdc-a0d063110479	53e3741b-51ee-4d66-9f6b-33ecabd8b463	150.00	USD	CASH	PAID	2025-12-17	11:11:14	2025-12-17 09:11:14.674	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-17 11:11:14.675363	2025-12-17 11:11:14.675363	0.00	\N
30d4377f-d72a-434a-8920-24cfeb030047	KU251216-0004	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	800.00	USD	CASH	PAID	2025-12-16	10:23:40	2025-12-17 09:22:24.55	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-16 10:23:40.406174	2025-12-17 11:22:24.551211	0.00	\N
b8007e82-87c6-4533-bef2-8d03893391ff	KU251216-0008	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	3000.00	USD	CASH	PAID	2025-12-16	11:40:19	2025-12-17 09:22:31.613	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-16 11:40:19.418692	2025-12-17 11:22:31.615754	0.00	\N
530ddfeb-0f0c-400e-aa35-c15f2dad39bd	KU251216-0011	c21e9a75-8949-49c2-b2c9-ff6c316fae26	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-16	12:44:09	2025-12-17 09:22:46.842	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-16 12:44:09.845112	2025-12-17 11:22:46.84435	0.00	\N
278602bd-ac46-43b8-ad81-8156541ead23	KU251216-0014	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-16	13:55:28	2025-12-17 09:22:55.381	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-16 13:55:28.522597	2025-12-17 11:22:55.383715	0.00	\N
5da36c9e-125c-4c2c-aab5-f25a68dd7226	KU251217-0010	5515cbf4-6ee1-435a-aeb4-5e433cc31cd0	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-17	11:59:29	2025-12-17 09:59:29.413	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-17 11:59:29.414456	2025-12-17 11:59:29.414456	0.00	\N
41f72533-bf13-4b90-baa5-c80e2949ae70	KU251217-0011	9f7b27a4-b866-4e8f-9138-c385cf2b4f0c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-17	12:04:17	2025-12-17 10:04:17.881	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-17 12:04:17.882477	2025-12-17 12:04:17.882477	0.00	\N
4dafbe0f-3c81-4199-adf7-a8862b5e4737	KU251217-0008	0f639da7-b8ae-4671-a1ce-d66c76169567	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-17	11:20:55	2025-12-17 12:13:39.158	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-17 11:20:55.518361	2025-12-17 14:13:39.1592	0.00	\N
0fcde69b-a761-4ce1-b0db-a5ba79b669eb	KU251217-0003	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-17	11:06:34	2025-12-18 10:34:10.815	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-17 11:06:34.036802	2025-12-18 12:34:10.816405	0.00	\N
6ae90e41-36df-4973-ba90-91a66ec657ff	KU251217-0004	6bbc4e6f-aac0-43fc-8235-82d517012bba	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-17	11:07:54	2025-12-18 10:34:15.49	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-17 11:07:54.681309	2025-12-18 12:34:15.49224	0.00	\N
a1136474-a990-4c3d-a1a0-0707bed0b984	KU251217-0006	dba747bc-6b58-44b5-9c5a-88376604bf41	53e3741b-51ee-4d66-9f6b-33ecabd8b463	800.00	USD	CASH	PAID	2025-12-17	11:12:59	2025-12-18 10:34:33.69	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-17 11:12:59.981844	2025-12-18 12:34:33.691377	0.00	\N
58329941-34d7-46a2-bfef-8f5fcfae7522	KU251216-0013	970181ef-e333-4707-b74c-f6818f947fd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-16	13:52:08	2025-12-18 13:42:09.919	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-16 13:52:08.225986	2025-12-18 15:42:09.919482	0.00	\N
d6bc8f81-3ef2-4dc8-9607-872ba500f815	KU251217-0009	86b93c70-e8e1-4bce-8182-c626b082b8bf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	10000.00	USD	CASH	PAID	2025-12-17	11:24:38	2025-12-20 13:46:21.366	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-17 11:24:38.678128	2025-12-20 15:46:21.366807	0.00	\N
2bbe5a82-1974-49e2-8c45-1889579e35f3	KU251217-0012	9f7b27a4-b866-4e8f-9138-c385cf2b4f0c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-17	12:23:59	2025-12-17 10:23:59.825	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-17 12:23:59.825955	2025-12-17 12:23:59.825955	0.00	\N
4c7b0a49-d618-4d0c-bd67-95d3bb316d5e	KU251217-0013	ee3455fe-2bf7-487c-8e25-e2dc57b63d3d	53e3741b-51ee-4d66-9f6b-33ecabd8b463	830.00	USD	CASH	PAID	2025-12-17	13:15:02	2025-12-17 11:15:02.656	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-17 13:15:02.657478	2025-12-17 13:15:02.657478	0.00	\N
9a187551-05c9-4359-a47e-d7b95fe43ac5	KU251217-0014	cc21613a-e018-4958-b1f3-ba046afe9d5e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-17	13:16:51	2025-12-17 11:16:51.855	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-17 13:16:51.855717	2025-12-17 13:16:51.855717	0.00	\N
054b3983-b9d9-4f37-b08b-72078638efb2	KU251217-0007	0f639da7-b8ae-4671-a1ce-d66c76169567	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-17	11:14:33	2025-12-17 12:13:34.155	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-17 11:14:33.505859	2025-12-17 14:13:34.155741	0.00	\N
6b2a30bb-e3c6-4244-96c7-9702cd429cdb	KU251217-0016	cc21613a-e018-4958-b1f3-ba046afe9d5e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-17	14:49:54	2025-12-17 12:49:54.404	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-17 14:49:54.405181	2025-12-17 14:49:54.405181	0.00	\N
e862a322-e4c0-460f-9c9b-293cd42fee3c	KU251217-0017	211317cb-7002-4abc-8350-ea60cd33dcd7	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-17	15:40:40	2025-12-17 13:40:40.922	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-17 15:40:40.921904	2025-12-17 15:40:40.921904	0.00	\N
cb13f688-474e-4610-b972-4c16935ea7a0	KU251217-0018	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2500.00	USD	CASH	PAID	2025-12-17	15:42:10	2025-12-17 13:42:10.497	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-17 15:42:10.500431	2025-12-17 15:42:10.500431	0.00	\N
ff3ecc84-c6b7-445e-a52b-6043a2367cc6	KU251217-0019	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-17	15:43:12	2025-12-17 13:43:12.211	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-17 15:43:12.212132	2025-12-17 15:43:12.212132	0.00	\N
3843a6fd-ad43-47dc-9651-097cc4f54500	KU251218-0001	c21e9a75-8949-49c2-b2c9-ff6c316fae26	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-18	09:01:42	2025-12-18 07:01:42.745	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 09:01:42.7489	2025-12-18 09:01:42.7489	0.00	\N
1ca353aa-3863-48dc-8693-d90b37b81a74	KU251218-0005	84852b83-ffcb-411d-be4b-3c194a999d68	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-18	09:53:34	2025-12-18 07:53:34.227	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 09:53:34.229006	2025-12-18 09:53:34.229006	0.00	\N
39c6b016-62fd-45fd-be38-cb633b43c7fe	KU251218-0006	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-18	09:54:42	2025-12-18 07:54:42.303	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 09:54:42.305558	2025-12-18 09:54:42.305558	0.00	\N
6bfbd02b-85ba-42b5-9c78-909d7bb882b6	KU251218-0007	5515cbf4-6ee1-435a-aeb4-5e433cc31cd0	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-18	09:56:12	2025-12-18 07:56:12.272	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 09:56:12.27543	2025-12-18 09:56:12.27543	0.00	\N
f213be60-2ee0-4457-9658-55147a746e06	KU251218-0009	ed27f8db-83f3-4dd7-ab16-5c315c233794	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-18	11:06:32	2025-12-18 09:06:32.75	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 11:06:32.752187	2025-12-18 11:06:32.752187	0.00	\N
96a9b053-45f6-425a-af0a-8a444704dbe9	KU251218-0010	7136d6c5-245b-421b-9bbb-84c637cf1577	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-18	11:08:03	2025-12-18 09:08:03.168	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 11:08:03.169147	2025-12-18 11:08:03.169147	0.00	\N
2204be19-e257-41be-9881-85ebfe1ee6b4	KU251218-0011	1602c2a5-5908-4cbf-b14a-73d18ffafbd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-18	11:12:38	2025-12-18 09:12:38.623	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 11:12:38.624532	2025-12-18 11:12:38.624532	0.00	\N
99791ab8-aae3-428b-b04a-5ee397df7267	KU251218-0012	9cb5fbf2-9fae-4518-a5da-f5bb6b63aa13	53e3741b-51ee-4d66-9f6b-33ecabd8b463	900.00	USD	CASH	PAID	2025-12-18	11:24:23	2025-12-18 09:24:23.094	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 11:24:23.094935	2025-12-18 11:24:23.094935	0.00	\N
435c85b3-8bab-4d97-b534-b3db4ce4c652	KU251218-0013	f925cb0f-5b64-4efa-aa01-f58f2aa7b5f1	53e3741b-51ee-4d66-9f6b-33ecabd8b463	260.00	USD	CASH	PAID	2025-12-18	11:36:30	2025-12-18 09:36:30.23	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 11:36:30.231479	2025-12-18 11:36:30.231479	0.00	\N
f35e254e-8db9-4600-9612-d34ce42fdcbf	KU251217-0015	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-17	13:27:37	2025-12-18 10:34:40.075	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-17 13:27:37.425744	2025-12-18 12:34:40.075506	0.00	\N
7c59cb18-f4df-40bc-a584-2867f4f24d24	KU251218-0016	d9fedfe6-0d89-49fe-b06c-97529354a88c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-18	14:13:38	2025-12-18 12:24:08.836	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 14:13:38.298345	2025-12-18 14:24:08.837204	0.00	\N
8a8ad7f9-36c4-45f1-89e1-06b75b9f225d	KU251211-0006	f3d21b8c-c1d8-415f-ab1e-6307eb765b77	53e3741b-51ee-4d66-9f6b-33ecabd8b463	3000.00	USD	CASH	PAID	2025-12-11	11:17:41	2025-12-18 14:24:37.253	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-11 11:17:41.05897	2025-12-18 16:24:37.255719	0.00	\N
db4fda1c-ee7e-45d3-badf-274c76304fe3	KU251218-0020	f3d21b8c-c1d8-415f-ab1e-6307eb765b77	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-18	16:27:38	2025-12-18 14:27:38.243	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 16:27:38.245191	2025-12-18 16:27:38.245191	0.00	\N
8afba074-9933-49ca-a755-860069b9073c	KU251218-0021	4be0e1ae-b1c7-42fd-b2d1-1ae7ffc7e31e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	520.00	USD	CASH	PAID	2025-12-18	16:28:53	2025-12-18 14:28:53.935	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 16:28:53.936256	2025-12-18 16:28:53.936256	0.00	\N
5d3de28a-ee94-4366-95f7-4fd4084b2702	KU251218-0022	3aefd7d8-f08a-40f7-a105-c2d0d15b1083	53e3741b-51ee-4d66-9f6b-33ecabd8b463	600.00	USD	CASH	PAID	2025-12-18	16:30:27	2025-12-18 14:30:27.642	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 16:30:27.643417	2025-12-18 16:30:27.643417	0.00	\N
493372e4-3618-436a-aed0-79ac7ba6035a	KU251218-0023	e21cbb1d-137a-4ed8-b5e4-00e828e9f278	53e3741b-51ee-4d66-9f6b-33ecabd8b463	630.00	USD	CASH	PAID	2025-12-18	17:08:12	2025-12-18 15:08:12.923	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 17:08:12.929145	2025-12-18 17:08:12.929145	0.00	\N
0ce748bc-825d-4d4c-9a65-0a7a835b6275	KU251219-0002	3aefd7d8-f08a-40f7-a105-c2d0d15b1083	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-19	09:34:22	2025-12-19 07:34:22.193	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-19 09:34:22.197736	2025-12-19 09:34:22.197736	0.00	\N
9ff11537-0a89-4a48-b8b0-20c9c33b412c	KU251219-0004	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1200.00	USD	CASH	PAID	2025-12-19	10:52:32	2025-12-19 08:52:32.855	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-19 10:52:32.860875	2025-12-19 10:52:32.860875	0.00	\N
57f2c0a8-b241-4187-a007-4f08ea6c9ac8	KU251218-0003	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-18	09:02:28	2025-12-19 08:57:30.049	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 09:02:28.815527	2025-12-19 10:57:30.056473	0.00	\N
95f8b6a0-f391-4e6b-bde7-2a3c69540719	KU251218-0008	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	780.00	USD	CASH	PAID	2025-12-18	09:58:06	2025-12-19 08:57:40.461	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 09:58:06.20268	2025-12-19 10:57:40.468829	0.00	\N
682d0a9a-100c-4a43-b303-e2d828fed4b9	KU251218-0004	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-18	09:13:44	2025-12-19 08:57:51.228	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 09:13:44.747246	2025-12-19 10:57:51.229526	0.00	\N
2b352779-95cd-40ef-88c9-6d5fa4c639e9	KU251218-0014	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	750.00	USD	CASH	PAID	2025-12-18	12:54:56	2025-12-19 08:58:03.497	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 12:54:56.562525	2025-12-19 10:58:03.497846	0.00	\N
8834ded3-0c7a-43df-9272-a3323e71d1ab	KU251218-0015	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	250.00	USD	CASH	PAID	2025-12-18	12:56:27	2025-12-19 08:58:08.661	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 12:56:27.588132	2025-12-19 10:58:08.662332	0.00	\N
a400833c-c8d5-44f2-b525-505cf3c663a7	KU251218-0017	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	3000.00	USD	CASH	PAID	2025-12-18	15:19:42	2025-12-19 08:58:14.961	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 15:19:42.252995	2025-12-19 10:58:14.961813	0.00	\N
ce4f4434-f6b2-4fa7-b39b-7ad73d74b0a8	KU251218-0018	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-18	15:45:19	2025-12-19 08:58:25.825	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 15:45:19.842647	2025-12-19 10:58:25.826106	0.00	\N
fb23e11a-9d5e-459f-bd90-16e6e1434fe4	KU251218-0019	970181ef-e333-4707-b74c-f6818f947fd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-18	15:58:53	2025-12-20 10:34:07.016	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 15:58:53.052808	2025-12-20 12:34:07.017059	0.00	\N
6e94a0c1-0baf-4599-b8af-f91d2728db57	KU251218-0024	0f639da7-b8ae-4671-a1ce-d66c76169567	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-18	17:10:07	2025-12-22 13:13:43.007	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 17:10:07.626758	2025-12-22 15:13:43.007389	0.00	\N
25f3cde1-129b-41be-8490-6c754bf2202a	KU251219-0001	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-19	09:12:47	2025-12-22 13:26:10.393	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-19 09:12:47.25759	2025-12-22 15:26:10.394243	0.00	\N
e82a31e6-0fb7-41d0-8ea4-9ee1e5bf8f18	KU251219-0003	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-19	10:05:14	2025-12-23 13:33:19.817	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-19 10:05:14.515632	2025-12-23 15:33:19.817704	0.00	\N
2c7419fd-d39a-46cc-9888-aa745382c793	KU251218-0002	6bbc4e6f-aac0-43fc-8235-82d517012bba	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2900.00	USD	CASH	PAID	2025-12-18	09:02:03	2025-12-19 08:57:23.315	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-18 09:02:03.829258	2025-12-19 10:57:23.322304	0.00	\N
a0a54275-af47-4aac-846d-7d5ca301f8dd	KU251220-0002	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-20	10:20:40	2025-12-20 08:20:40.267	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 10:20:40.267778	2025-12-20 10:20:40.267778	0.00	\N
64707ace-60b4-449c-97c9-20f4e36bd322	KU251220-0003	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-20	10:22:51	2025-12-20 08:22:51.089	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	CHANG TOBAAIR	2025-12-20 10:24:16.189119	2025-12-20 10:22:51.090498	2025-12-20 10:24:16.189119	0.00	\N
ab8002f2-3c8e-44fc-9504-1366f536aec8	KU251220-0004	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-20	10:24:30	2025-12-20 08:24:30.555	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 10:24:30.556152	2025-12-20 10:24:30.556152	0.00	\N
2f6f50da-6c7b-435f-96bb-e7a9fc298338	KU251220-0005	9f7b27a4-b866-4e8f-9138-c385cf2b4f0c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	150.00	USD	CASH	PAID	2025-12-20	10:27:39	2025-12-20 08:27:39.189	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 10:27:39.189994	2025-12-20 10:27:39.189994	0.00	\N
8b48d977-1d52-4a29-8b5b-bc88cab3020e	KU251220-0009	48c75540-955e-4fa8-a024-b61780e4e248	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-20	11:44:17	2025-12-20 09:44:17.572	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 11:44:17.573457	2025-12-20 11:44:17.573457	0.00	\N
a3544a55-fdef-4218-b34f-d202f67160e7	KU251220-0008	d9fedfe6-0d89-49fe-b06c-97529354a88c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-20	11:18:00	2025-12-20 10:00:46.146	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 11:18:00.836842	2025-12-20 12:00:46.146801	0.00	\N
80bde68f-302d-4ea7-ac24-caae4bf2123c	KU251220-0010	53a16add-3e72-41d7-9689-51997410abf5	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-20	12:02:01	2025-12-20 10:02:01.96	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 12:02:01.961588	2025-12-20 12:02:01.961588	0.00	\N
50fd695c-2180-46e0-bede-aca513a99664	KU251220-0007	a8eb6611-3c8e-4b67-a269-68033e418688	53e3741b-51ee-4d66-9f6b-33ecabd8b463	310.00	USD	CASH	PAID	2025-12-20	10:40:06	2025-12-20 10:03:43.723	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 10:40:06.53562	2025-12-20 12:03:43.723949	0.00	\N
feb6bf86-9653-4c34-a5bb-b07da15d00e6	KU251220-0001	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	800.00	USD	CASH	PAID	2025-12-20	10:06:36	2025-12-20 10:06:46.555	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 10:06:36.785136	2025-12-20 12:06:46.556054	0.00	\N
405a2160-36b1-4f59-b63d-a0747555cfd0	KU251220-0011	ee3455fe-2bf7-487c-8e25-e2dc57b63d3d	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1200.00	USD	CASH	PAID	2025-12-20	12:32:56	2025-12-20 10:32:56.562	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 12:32:56.56369	2025-12-20 12:32:56.56369	0.00	\N
e442e061-b483-496e-82cf-e1e9ec443f4c	KU251220-0012	84852b83-ffcb-411d-be4b-3c194a999d68	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-20	12:49:22	2025-12-20 10:49:22.924	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 12:49:22.925108	2025-12-20 12:49:22.925108	0.00	\N
e09e32fe-b3d4-400c-9477-6aa12c7495c9	KU251220-0013	cc21613a-e018-4958-b1f3-ba046afe9d5e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	800.00	USD	CASH	PAID	2025-12-20	13:00:05	2025-12-20 11:00:05.865	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 13:00:05.865831	2025-12-20 13:00:05.865831	0.00	\N
fa896ad8-64ce-4074-808f-e0d23578dc78	KU251219-0005	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-19	10:53:09	2025-12-20 11:20:14.281	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-19 10:53:09.496002	2025-12-20 13:20:14.281698	0.00	\N
3a42789f-09e6-40b9-bba6-c04188a20cff	KU251220-0016	8e34184e-2091-4691-a5dc-329a22d316e9	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-20	13:21:09	2025-12-20 11:21:09.268	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 13:21:09.269403	2025-12-20 13:21:09.269403	0.00	\N
91a803e6-8d9a-44d1-82e9-a5b2a54e087a	KU251220-0017	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	3000.00	USD	CASH	PAID	2025-12-20	13:34:56	2025-12-20 11:34:56.886	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 13:34:56.887531	2025-12-20 13:34:56.887531	0.00	\N
204e903b-de1d-4268-aca5-1cffeda34ac5	KU251220-0018	cd527560-3833-4f9d-909f-5ae148a17fd5	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-20	13:43:17	2025-12-20 11:43:17.393	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 13:43:17.394721	2025-12-20 13:43:17.394721	0.00	\N
53ddab0f-dc0f-41d1-8b67-288010eaae0f	KU251220-0019	0f639da7-b8ae-4671-a1ce-d66c76169567	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-20	14:13:48	2025-12-20 12:13:48.678	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 14:13:48.679726	2025-12-20 14:13:48.679726	0.00	\N
82f4a978-6855-4064-837a-bb778bde00ce	KU251220-0006	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-20	10:37:10	2025-12-20 12:58:00.299	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 10:37:10.150604	2025-12-20 14:58:00.300001	0.00	\N
ddbb82b7-c96f-4b10-b26b-ab33f49d1759	KU251222-0002	84852b83-ffcb-411d-be4b-3c194a999d68	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-22	08:31:14	2025-12-22 06:31:14.392	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-22 08:31:14.393319	2025-12-22 08:31:14.393319	0.00	\N
40323449-3b38-40f1-81e2-b816c4dcbd99	KU251222-0003	d9fedfe6-0d89-49fe-b06c-97529354a88c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-22	08:46:49	2025-12-22 06:46:49.856	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-22 08:46:49.857396	2025-12-22 08:46:49.857396	0.00	\N
6cfd142a-41d3-48ce-8c10-fd274802a4fa	KU251222-0005	7136d6c5-245b-421b-9bbb-84c637cf1577	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-22	11:45:45	2025-12-22 09:45:45.064	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-22 11:45:45.066699	2025-12-22 11:45:45.066699	0.00	\N
032ed399-a131-4abc-a179-a273bb1faac4	KU251222-0008	40d63f00-ddc5-4f8c-aa25-cd57c5e237de	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-22	14:20:48	2025-12-22 12:20:48.571	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-22 14:20:48.571955	2025-12-22 14:20:48.571955	0.00	\N
841c944a-ced4-4822-a911-02da53deac0b	KU251222-0010	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-22	14:33:25	2025-12-22 12:33:25.956	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-22 14:33:25.957216	2025-12-22 14:33:25.957216	0.00	\N
1a6b733b-d5b8-42dc-a5e6-4a51dbb7a347	KU251222-0011	e21cbb1d-137a-4ed8-b5e4-00e828e9f278	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1200.00	USD	CASH	PAID	2025-12-22	14:36:15	2025-12-22 12:36:15.197	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-22 14:36:15.198134	2025-12-22 14:36:15.198134	0.00	\N
fc0d8ac6-3c20-400d-b282-d32f49abc168	KU251220-0020	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	53e3741b-51ee-4d66-9f6b-33ecabd8b463	700.00	USD	CASH	PAID	2025-12-20	14:27:45	2025-12-22 13:26:43.959	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 14:27:45.512675	2025-12-22 15:26:43.960147	0.00	\N
77304099-861f-4188-a0d2-0d45808e7894	KU251220-0022	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	800.00	USD	CASH	PAID	2025-12-20	19:10:52	2025-12-22 13:27:09.622	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 19:10:52.531952	2025-12-22 15:27:09.623402	0.00	\N
66f3e4dc-11c9-4818-8bef-b29e1ea52e22	KU251220-0023	f925cb0f-5b64-4efa-aa01-f58f2aa7b5f1	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-20	19:12:19	2025-12-22 13:27:17.938	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 19:12:19.051904	2025-12-22 15:27:17.939045	0.00	\N
e6a84aa9-e0ca-4a3a-86c5-0b6613d63712	KU251221-0001	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-21	11:23:45	2025-12-22 13:28:01.166	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-21 11:23:45.006162	2025-12-22 15:28:01.167381	0.00	\N
f71e28e9-eaad-49f3-baaf-528d013c2269	KU251221-0002	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-21	11:31:42	2025-12-22 13:28:13.219	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-21 11:31:42.091844	2025-12-22 15:28:13.219579	0.00	\N
ec30b73d-5278-4510-8584-9fa5bffe2525	KU251222-0001	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1100.00	USD	CASH	PAID	2025-12-22	06:33:28	2025-12-22 13:28:20.014	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-22 06:33:28.461232	2025-12-22 15:28:20.015186	0.00	\N
1a6e89ac-7ce5-49d2-93e7-207b37c85571	KU251222-0009	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-22	14:29:04	2025-12-23 11:13:06.781	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-22 14:29:04.875267	2025-12-23 13:13:06.78238	0.00	\N
ffbbca0a-dcbc-464e-8e85-5f9e6433d4a3	KU251222-0004	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-22	11:41:43	2025-12-23 11:16:07.239	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-22 11:41:43.921035	2025-12-23 13:16:07.239923	0.00	\N
d7ee627f-7ff2-487e-9dfa-22d08d4743d0	KU251222-0006	dba747bc-6b58-44b5-9c5a-88376604bf41	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-22	12:31:45	2025-12-23 11:16:12.413	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-22 12:31:45.049776	2025-12-23 13:16:12.414277	0.00	\N
024ade6f-be59-4436-845b-3e37cf37058d	KU251220-0021	970181ef-e333-4707-b74c-f6818f947fd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1200.00	USD	CASH	PAID	2025-12-20	15:00:06	2025-12-23 11:16:25.554	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 15:00:06.900425	2025-12-23 13:16:25.554701	0.00	\N
531d412e-c1c9-479c-b3f5-8f881cc9260a	KU251222-0007	970181ef-e333-4707-b74c-f6818f947fd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-22	14:19:45	2025-12-24 12:31:16.443	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-22 14:19:45.607847	2025-12-24 14:31:16.44397	0.00	\N
eaa80b1c-312d-4227-b513-118e397224d8	KU251220-0014	86b93c70-e8e1-4bce-8182-c626b082b8bf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	10000.00	USD	CASH	PAID	2025-12-20	13:18:01	2025-12-30 12:08:40.326	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 13:18:01.057455	2025-12-30 14:08:40.32831	0.00	\N
d5f1d99b-18f6-43bf-abd0-8a256e4f8718	KU251222-0012	84852b83-ffcb-411d-be4b-3c194a999d68	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-22	14:46:37	2025-12-22 12:46:37.394	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-22 14:46:37.395191	2025-12-22 14:46:37.395191	0.00	\N
1a6e7414-420b-4af7-8174-2de392df7fa4	KU251220-0015	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-20	13:19:38	2025-12-22 13:26:41.389	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-20 13:19:38.927795	2025-12-22 15:26:41.390683	0.00	\N
02c5a003-1c31-4296-9ce1-a45666229bfc	KU251222-0013	d9fedfe6-0d89-49fe-b06c-97529354a88c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-22	16:06:25	2025-12-22 14:17:01.601	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-22 16:06:25.84653	2025-12-22 16:17:01.601658	0.00	\N
a2613e10-382f-445b-b98d-0f114f8c1210	KU251223-0001	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PAID	2025-12-23	08:13:40	2025-12-23 06:13:40.295	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-23 08:13:40.296406	2025-12-23 08:13:40.296406	0.00	\N
3be53a62-d9aa-4af6-92a2-102f1372c9d5	KU251223-0003	d9fedfe6-0d89-49fe-b06c-97529354a88c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PAID	2025-12-23	09:51:45	2025-12-23 07:51:45.114	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-23 09:51:45.115784	2025-12-23 09:51:45.115784	0.00	\N
015ec5ea-191b-4fa2-bc72-04b6d86b5ab5	KU251223-0004	dd35069f-40bd-423b-9b0a-edc6781db7a5	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-23	12:04:26	2025-12-23 10:04:26.338	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-23 12:04:26.341715	2025-12-23 12:04:26.341715	0.00	\N
73ada1ac-a5b8-4de8-9ae0-ed8b721b1840	KU251223-0005	81642bfc-31dc-49bf-9008-2a4fa2babe4e	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-23	12:22:11	2025-12-23 10:22:11.9	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-23 12:22:11.902107	2025-12-23 12:22:11.902107	0.00	\N
ef6f3d67-e557-4efe-af57-b5d9825e07cf	KU251223-0006	8264a667-ae81-48b9-84fd-d795f170737c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-23	12:22:53	2025-12-23 10:22:53.159	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-23 12:22:53.160642	2025-12-23 12:22:53.160642	0.00	\N
3d9337cb-e4f7-4d44-9950-0c7809b232da	KU251223-0008	bd7755a6-ba4f-474c-a854-5857acb022a3	53e3741b-51ee-4d66-9f6b-33ecabd8b463	210.00	USD	CASH	PAID	2025-12-23	12:26:14	2025-12-23 10:26:14.509	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-23 12:26:14.510331	2025-12-23 12:26:14.510331	0.00	\N
bc6c597c-210a-467a-9938-1eec58878538	KU251222-0015	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-22	16:30:55	2025-12-23 11:12:58.185	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-22 16:30:55.812626	2025-12-23 13:12:58.186434	0.00	\N
e54133e2-d40e-4fa6-aa0b-df3a8fc2f1fd	KU251223-0007	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-23	12:23:25	2025-12-23 12:33:18.932	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-23 12:23:25.7116	2025-12-23 14:33:18.933042	0.00	\N
c57d89f5-0df7-4f7d-93a6-4a9a651d1e7d	KU251223-0011	e8085a42-1018-435a-b5f8-6ec0f4f6d9b2	53e3741b-51ee-4d66-9f6b-33ecabd8b463	450.00	USD	CASH	PAID	2025-12-23	14:51:15	2025-12-23 12:51:15.867	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-23 14:51:15.868494	2025-12-23 14:51:15.868494	0.00	\N
8150672d-faaf-41eb-a805-bd0a17dd90a8	KU251223-0014	e21cbb1d-137a-4ed8-b5e4-00e828e9f278	53e3741b-51ee-4d66-9f6b-33ecabd8b463	650.00	USD	CASH	PAID	2025-12-23	16:14:08	2025-12-23 14:14:08.525	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-23 16:14:08.527939	2025-12-23 16:14:08.527939	0.00	\N
b37a3cac-be0b-4416-8d4d-f6e9e27c768c	KU251223-0010	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	600.00	USD	CASH	PENDING	2025-12-23	14:34:41	\N	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	NOT ISSUE	2025-12-24 07:05:23.083014	2025-12-23 14:34:41.549765	2025-12-24 07:05:23.083014	0.00	\N
305534e4-80b4-4672-b5c6-0ce8d026ccb8	KU251224-0002	40d63f00-ddc5-4f8c-aa25-cd57c5e237de	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1540.00	USD	CASH	PAID	2025-12-24	10:19:04	2025-12-24 08:19:04.669	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-24 10:19:04.671111	2025-12-24 10:19:04.671111	0.00	\N
698d1b56-e564-4c6e-aa66-dc5c805ef1a7	KU251224-0003	ee3455fe-2bf7-487c-8e25-e2dc57b63d3d	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1200.00	USD	CASH	PAID	2025-12-24	12:18:18	2025-12-24 10:18:18.609	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-24 12:18:18.610929	2025-12-24 12:18:18.610929	0.00	\N
bd297e1a-f701-4fa4-a0e2-39d3860cd779	KU251224-0004	580f7ae4-f6fd-4fd4-8a4f-46a53bc3fc36	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-24	12:36:37	2025-12-24 10:36:37.592	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-24 12:36:37.593564	2025-12-24 12:36:37.593564	0.00	\N
409df355-ab31-4380-af96-4846bb6444dd	KU251224-0001	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	600.00	USD	CASH	PAID	2025-12-24	07:05:36	2025-12-24 10:53:04.454	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-24 07:05:36.609586	2025-12-24 12:53:04.455239	0.00	\N
b09a2083-3386-4883-aa6b-ec90884abbb4	KU251224-0005	5515cbf4-6ee1-435a-aeb4-5e433cc31cd0	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-24	13:25:55	2025-12-24 11:25:55.507	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-24 13:25:55.508745	2025-12-24 13:25:55.508745	0.00	\N
476a9800-3995-42e3-b6a1-aeca5ac1120b	KU251223-0013	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-23	15:35:46	2025-12-24 12:16:26.293	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-23 15:35:46.628168	2025-12-24 14:16:26.294119	0.00	\N
aae1e667-0c21-4c31-8caa-154290cbe9bb	KU251223-0012	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	600.00	USD	CASH	PAID	2025-12-23	15:34:03	2025-12-24 12:16:31.652	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-23 15:34:03.688988	2025-12-24 14:16:31.653127	0.00	\N
db76aa9e-1850-4b15-a6fa-b280f6050829	KU251223-0002	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-23	08:57:45	2025-12-24 12:16:39.211	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-23 08:57:45.993656	2025-12-24 14:16:39.212418	0.00	\N
042239d4-e239-4bfb-a4c6-2d49fa7a4d8e	KU251222-0014	f3d21b8c-c1d8-415f-ab1e-6307eb765b77	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-22	16:08:52	2025-12-24 12:18:19.367	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-22 16:08:52.57816	2025-12-24 14:18:19.368672	0.00	\N
aea407c1-ee83-42b0-bded-c6b6af108d72	KU251224-0008	dd35069f-40bd-423b-9b0a-edc6781db7a5	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-24	15:16:42	2025-12-24 13:16:42.334	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-24 15:16:42.335604	2025-12-24 15:16:42.335604	0.00	\N
c733322e-5ff4-4b3b-ad38-c3948dd3c531	KU251224-0009	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	3000.00	USD	CASH	PAID	2025-12-24	16:01:31	2025-12-25 10:26:33.385	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-24 16:01:31.998776	2025-12-25 12:26:33.386462	0.00	\N
d10a41b3-575a-4713-80fd-196076323337	KU251224-0006	211317cb-7002-4abc-8350-ea60cd33dcd7	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-24	14:32:09	2025-12-24 12:32:09.023	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	t	date 25	2025-12-25 12:40:32.51867	2025-12-24 14:32:09.024318	2025-12-25 12:40:32.51867	0.00	\N
b3af866b-12b7-4351-8cc4-1b453abf2046	KU251225-0002	211317cb-7002-4abc-8350-ea60cd33dcd7	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-25	12:40:48	2025-12-25 10:40:48.805	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-25 12:40:48.80788	2025-12-25 12:40:48.80788	0.00	\N
fdafa6ab-082e-4de5-8fa0-040b23b86b7f	KU251226-0001	c21e9a75-8949-49c2-b2c9-ff6c316fae26	53e3741b-51ee-4d66-9f6b-33ecabd8b463	900.00	USD	CASH	PAID	2025-12-26	08:33:21	2025-12-26 06:33:21.049	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-26 08:33:21.052658	2025-12-26 08:33:21.052658	0.00	\N
4169a8e9-055b-4f1b-a2ea-b2cd19a1bc48	KU251225-0001	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	600.00	USD	CASH	PAID	2025-12-25	08:25:51	2025-12-26 08:13:39.25	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-25 08:25:51.286586	2025-12-26 10:13:39.25077	0.00	\N
11ad6544-f5d8-4bb0-8c6a-28ccaf5bd01f	KU251226-0003	d9fedfe6-0d89-49fe-b06c-97529354a88c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-26	09:59:27	2025-12-26 08:20:48.638	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-26 09:59:27.78161	2025-12-26 10:20:48.638608	0.00	\N
7d3de2b1-9a79-476c-9672-70ff99c802e5	KU251226-0005	f925cb0f-5b64-4efa-aa01-f58f2aa7b5f1	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2025-12-26	11:40:52	2025-12-26 09:40:52.375	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-26 11:40:52.375948	2025-12-26 11:40:52.375948	0.00	\N
f9f279ec-90ea-4588-bead-10ad36a7cfce	KU251226-0006	580f7ae4-f6fd-4fd4-8a4f-46a53bc3fc36	53e3741b-51ee-4d66-9f6b-33ecabd8b463	100.00	USD	CASH	PAID	2025-12-26	15:46:29	2025-12-26 13:46:29.255	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-26 15:46:29.253972	2025-12-26 15:46:29.253972	0.00	\N
62700f03-478c-43d3-a97c-99fd51509517	KU251226-0004	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1600.00	USD	CASH	PAID	2025-12-26	10:28:49	2025-12-30 12:08:05.864	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-26 10:28:49.653803	2025-12-30 14:08:05.866033	0.00	\N
d8855314-38eb-4d0b-83e5-65c1a316bc98	KU251226-0002	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-26	09:41:45	2025-12-30 12:08:16.898	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-26 09:41:45.792316	2025-12-30 14:08:16.899206	0.00	\N
6c6257eb-045f-47d2-b63b-73f97e99f0ff	KU251225-0003	4700bec5-6fb9-4f8e-ad4e-6b09f81df49a	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1500.00	USD	CASH	PAID	2025-12-25	13:44:27	2025-12-30 12:08:22.214	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-25 13:44:27.01638	2025-12-30 14:08:22.215996	0.00	\N
b14ddf3c-0640-454d-8ac2-518880346ed6	KU251224-0010	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-24	18:19:10	2025-12-30 12:08:26.779	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-24 18:19:10.237783	2025-12-30 14:08:26.780643	0.00	\N
ac003e86-a16a-4299-b323-969907864400	KU251223-0009	4700bec5-6fb9-4f8e-ad4e-6b09f81df49a	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PAID	2025-12-23	14:15:33	2025-12-30 12:08:33.281	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-23 14:15:33.74708	2025-12-30 14:08:33.283385	0.00	\N
364e6514-78d2-4027-a10e-e99b837ef0f0	KU251229-0002	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-29	09:36:46	2025-12-29 07:36:46.519	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-29 09:36:46.52	2025-12-29 09:36:46.52	0.00	\N
4019998f-10ed-40e5-aa25-2be663cf9c82	KU251229-0001	d9fedfe6-0d89-49fe-b06c-97529354a88c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-29	08:43:53	2025-12-29 08:14:12.698	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-29 08:43:53.501591	2025-12-29 10:14:12.69927	0.00	\N
e1edf41a-936f-4fa5-959e-a94d2a61b2df	KU251229-0004	b54aa6a7-6276-48fc-a282-5a097f870f33	53e3741b-51ee-4d66-9f6b-33ecabd8b463	120.00	USD	CASH	PAID	2025-12-29	10:27:15	2025-12-29 08:27:15.695	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-29 10:27:15.696584	2025-12-29 10:27:15.696584	0.00	\N
6cc26ddc-9ed9-4fc5-aa04-61afd01a70eb	KU251229-0006	93c192e6-74cd-42ff-b0c3-157ed7865cef	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-29	12:10:03	2025-12-29 10:10:03.35	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-29 12:10:03.352432	2025-12-29 12:10:03.352432	0.00	\N
f0ed4204-d0c4-4768-be6b-8254eb7dc638	KU251229-0009	e5637070-3483-46e6-9b4f-5e03c1f1d211	53e3741b-51ee-4d66-9f6b-33ecabd8b463	240.00	USD	CASH	PAID	2025-12-29	12:42:56	2025-12-29 10:42:56.717	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-29 12:42:56.719606	2025-12-29 12:42:56.719606	0.00	\N
b1226944-a115-4e75-8e3e-07b307bce735	KU251224-0007	970181ef-e333-4707-b74c-f6818f947fd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-24	14:34:32	2025-12-29 11:32:17	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-24 14:34:32.125928	2025-12-29 13:32:17.001688	0.00	\N
a9fbafad-7999-47f6-9c7a-b4d474e5805c	KU251229-0010	e21cbb1d-137a-4ed8-b5e4-00e828e9f278	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2025-12-29	14:07:20	2025-12-29 12:07:20.08	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-29 14:07:20.082055	2025-12-29 14:07:20.082055	0.00	\N
38f9a737-6af0-4fc4-929e-a16e109706ad	KU251229-0011	b54aa6a7-6276-48fc-a282-5a097f870f33	53e3741b-51ee-4d66-9f6b-33ecabd8b463	370.00	USD	CASH	PAID	2025-12-29	14:18:39	2025-12-29 12:18:39.103	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-29 14:18:39.105573	2025-12-29 14:18:39.105573	0.00	\N
20cdd3b2-7823-48c3-98e6-70b6df5b611f	KU251229-0014	40d63f00-ddc5-4f8c-aa25-cd57c5e237de	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2025-12-29	15:48:24	2025-12-29 14:14:19.02	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-29 15:48:24.34252	2025-12-29 16:14:19.021069	0.00	\N
39f193a5-6d99-4a1d-bc84-1c159150457c	KU251229-0015	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-29	15:52:02	2025-12-30 10:05:27.399	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-29 15:52:02.036255	2025-12-30 12:05:27.400857	0.00	\N
a90f37d2-5470-4c3b-a80a-8804e4cc32d5	KU251229-0013	3fc16d1d-5a89-4ce8-a1c4-67cc031845f7	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-29	15:44:13	2025-12-30 10:05:36.373	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-29 15:44:13.440144	2025-12-30 12:05:36.375165	0.00	\N
e6a29a59-f8e8-4b4d-bb9b-357c4b3d3fdf	KU251229-0005	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-29	11:30:49	2025-12-30 10:06:08.542	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-29 11:30:49.186298	2025-12-30 12:06:08.543868	0.00	\N
05dd568b-b408-4dec-9949-c694801271ae	KU251229-0007	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	600.00	USD	CASH	PAID	2025-12-29	12:11:43	2025-12-30 10:08:51.955	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-29 12:11:43.928177	2025-12-30 12:08:51.957139	0.00	\N
720d21af-b8c2-4487-9be3-a007c39ce2f5	KU251229-0008	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PAID	2025-12-29	12:13:31	2025-12-30 10:08:57.846	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-29 12:13:31.445391	2025-12-30 12:08:57.847718	0.00	\N
dca3eccb-4c57-4b01-8b3d-ef113296c14d	KU251229-0003	dba747bc-6b58-44b5-9c5a-88376604bf41	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-29	10:03:56	2025-12-30 10:09:08.652	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-29 10:03:56.450729	2025-12-30 12:09:08.653514	0.00	\N
8fd649d3-89a3-4463-84dc-2bc92ad74257	KU251226-0008	9f7b27a4-b866-4e8f-9138-c385cf2b4f0c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1200.00	USD	CASH	PAID	2025-12-26	16:04:21	2025-12-30 12:07:55.384	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-26 16:04:21.205206	2025-12-30 14:07:55.385958	0.00	\N
c6953336-ad4c-487c-bfae-806a91159e47	KU251226-0007	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-26	15:47:53	2025-12-30 12:08:00.482	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-26 15:47:53.534221	2025-12-30 14:08:00.483518	0.00	\N
2b180834-b498-42cf-bd36-348391aaf2ad	KU251229-0012	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-29	14:44:16	2025-12-30 12:50:39.69	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-29 14:44:16.23437	2025-12-30 14:50:39.692602	0.00	\N
da2808f6-a45c-4d8c-a12f-f418e6d31586	KU251230-0006	b54aa6a7-6276-48fc-a282-5a097f870f33	53e3741b-51ee-4d66-9f6b-33ecabd8b463	310.00	USD	CASH	PAID	2025-12-30	16:11:41	2025-12-30 14:12:11.089	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-30 16:11:41.278568	2025-12-30 16:12:11.090185	0.00	\N
8ceff010-12bb-41ac-b91c-c91b9141e27a	KU251230-0007	40d63f00-ddc5-4f8c-aa25-cd57c5e237de	53e3741b-51ee-4d66-9f6b-33ecabd8b463	800.00	USD	CASH	PAID	2025-12-30	16:27:10	2025-12-30 14:27:10.617	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-30 16:27:10.619997	2025-12-30 16:27:10.619997	0.00	\N
80e871d0-9d98-4e5d-9fb4-71a26733208c	KU251230-0008	f3d21b8c-c1d8-415f-ab1e-6307eb765b77	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-30	16:29:26	2025-12-30 14:29:26.328	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-30 16:29:26.329755	2025-12-30 16:29:26.329755	0.00	\N
eb851655-960e-4c5f-b905-6fb6cef1699f	KU251231-0002	8e34184e-2091-4691-a5dc-329a22d316e9	53e3741b-51ee-4d66-9f6b-33ecabd8b463	460.00	USD	CASH	PAID	2025-12-31	10:21:30	2025-12-31 08:21:41.236	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-31 10:21:30.365995	2025-12-31 10:21:41.238217	0.00	\N
bf307658-567f-489e-99ad-adb85f06caa9	KU251231-0003	60fb4144-ba84-48b6-940c-b5fb58bd0ee7	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1500.00	USD	CASH	PAID	2025-12-31	11:03:47	2025-12-31 09:03:47.009	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-31 11:03:47.010529	2025-12-31 11:03:47.010529	0.00	\N
74d1eaf0-d2e0-4bc7-a9c8-56a2675d03c8	KU251231-0004	f3d21b8c-c1d8-415f-ab1e-6307eb765b77	02a25259-aec1-4f90-ac51-d302eb267d3a	600.00	USD	CASH	PAID	2025-12-31	12:08:30	2025-12-31 10:08:30.538	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-31 12:08:30.538747	2025-12-31 12:08:30.538747	0.00	\N
97f84263-e37e-4660-b484-a47c822395c1	KU251231-0005	8e34184e-2091-4691-a5dc-329a22d316e9	02a25259-aec1-4f90-ac51-d302eb267d3a	200.00	USD	CASH	PAID	2025-12-31	12:44:44	2025-12-31 10:44:44.684	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-31 12:44:44.685425	2025-12-31 12:44:44.685425	0.00	\N
71c09d0a-926e-4003-ae35-9b480e39787b	KU251231-0006	970181ef-e333-4707-b74c-f6818f947fd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	700.00	USD	CASH	PAID	2025-12-31	13:01:25	2025-12-31 11:01:25.958	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-31 13:01:25.959117	2025-12-31 13:01:25.959117	0.00	\N
d5e212ed-b546-42e1-80d7-1df5455277bf	KU251231-0001	9f5aed3b-a66e-4b40-acae-7a21ced33164	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-31	09:20:07	2025-12-31 11:04:02.576	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-31 09:20:07.777104	2025-12-31 13:04:02.577329	0.00	\N
282d5208-4916-4950-b2e3-1b38b359d29a	KU251230-0002	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2500.00	USD	CASH	PAID	2025-12-30	13:46:14	2025-12-31 11:05:44.15	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-30 13:46:14.12364	2025-12-31 13:05:44.150679	0.00	\N
6cdcb3ba-2545-44fe-914c-68203533209e	KU251230-0003	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2025-12-30	13:47:43	2025-12-31 11:05:54.128	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-30 13:47:43.039758	2025-12-31 13:05:54.12925	0.00	\N
5ce799c5-196e-426f-900c-abf1117e46b0	KU251230-0005	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	53e3741b-51ee-4d66-9f6b-33ecabd8b463	700.00	USD	CASH	PAID	2025-12-30	15:44:55	2025-12-31 11:06:01.314	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-30 15:44:55.535521	2025-12-31 13:06:01.314882	0.00	\N
65a75a2f-e903-48e8-a06a-a2ee3c3783cc	KU251231-0008	ee3455fe-2bf7-487c-8e25-e2dc57b63d3d	53e3741b-51ee-4d66-9f6b-33ecabd8b463	800.00	USD	CASH	PAID	2025-12-31	13:34:51	2025-12-31 11:34:51.872	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-31 13:34:51.872785	2025-12-31 13:34:51.872785	0.00	\N
f6c389f1-2fc4-4908-b354-5771a193269a	KU251230-0004	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-30	14:51:18	2025-12-31 12:57:20.327	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-30 14:51:18.989449	2025-12-31 14:57:20.327633	0.00	\N
af6b6563-91d4-418b-b8e1-a2dae155d099	KU251231-0007	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-31	13:32:35	2026-01-01 05:49:59.306	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-31 13:32:35.086876	2026-01-01 07:49:59.307111	0.00	\N
575b3ece-63ec-404f-8f01-5a39ff54e014	KU260102-0002	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1300.00	USD	CASH	PAID	2026-01-02	09:16:10	2026-01-02 07:16:10.247	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-02 09:16:10.251656	2026-01-02 09:16:10.251656	0.00	\N
dede5278-5746-4244-b2d6-639cd80f3a77	KU251231-0009	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2025-12-31	15:05:00	2026-01-02 11:19:31.694	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-31 15:05:00.811677	2026-01-02 13:19:31.695277	0.00	\N
7dd4cb98-56f3-40ea-80de-cb759b32a9aa	KU260101-0001	f3d21b8c-c1d8-415f-ab1e-6307eb765b77	6204b8eb-b190-4992-ad03-4dbb161cfff2	1000.00	USD	CASH	PAID	2026-01-01	10:39:31	2026-01-02 12:05:40.235	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-01 10:39:31.921071	2026-01-02 14:05:40.236024	0.00	\N
8a7350df-b8ee-4fbe-b3ee-c8491e6b0a73	KU251230-0001	86b93c70-e8e1-4bce-8182-c626b082b8bf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	10000.00	USD	CASH	PAID	2025-12-30	13:31:16	2026-01-05 12:22:27.548	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2025-12-30 13:31:16.383855	2026-01-05 14:22:27.548905	0.00	\N
c8d79c08-b3d7-4658-adfa-fa9ebc629050	KU260102-0003	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2000.00	USD	CASH	PENDING	2026-01-02	09:16:35	\N	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-02 09:16:35.905499	2026-01-02 09:16:35.905499	0.00	\N
460bc85b-db59-49b0-a798-705fcd61b713	KU260102-0006	77fda823-6bdf-4fc9-8530-f96a3e648550	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2026-01-02	12:05:26	2026-01-02 10:05:26.338	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-02 12:05:26.339637	2026-01-02 12:05:26.339637	0.00	\N
b37d1383-122e-4d8e-8998-c4dcf4829e07	KU260102-0007	3276bf6c-e1cc-4791-9e0d-44d6a9966ba4	53e3741b-51ee-4d66-9f6b-33ecabd8b463	120.00	USD	CASH	PAID	2026-01-02	12:14:29	2026-01-02 10:14:29.28	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-02 12:14:29.281513	2026-01-02 12:14:29.281513	0.00	\N
6d263b72-7574-4f06-9b3b-80bd32ab7e10	KU260102-0004	580f7ae4-f6fd-4fd4-8a4f-46a53bc3fc36	53e3741b-51ee-4d66-9f6b-33ecabd8b463	350.00	USD	CASH	PAID	2026-01-02	10:52:27	2026-01-02 10:51:01.748	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-02 10:52:27.347036	2026-01-02 12:51:01.749356	0.00	\N
e92aef44-4615-4033-8202-2d7fe4efc418	KU260102-0001	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2026-01-02	09:15:32	2026-01-02 10:51:13.699	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-02 09:15:32.607488	2026-01-02 12:51:13.700504	0.00	\N
7c5c4d43-cf1e-4c99-beea-544c6cd31194	KU260102-0008	580f7ae4-f6fd-4fd4-8a4f-46a53bc3fc36	53e3741b-51ee-4d66-9f6b-33ecabd8b463	150.00	USD	CASH	PAID	2026-01-02	12:52:05	2026-01-02 10:52:05.216	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-02 12:52:05.21717	2026-01-02 12:52:05.21717	0.00	\N
f8e36b77-f940-4752-80ba-995124bf3e14	KU260102-0009	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2026-01-02	13:15:26	2026-01-02 11:15:26.541	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-02 13:15:26.542077	2026-01-02 13:15:26.542077	0.00	\N
f42ec806-2fa6-4db9-acdf-af8058120340	KU260102-0012	3aefd7d8-f08a-40f7-a105-c2d0d15b1083	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2026-01-02	14:04:11	2026-01-02 12:04:11	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-02 14:04:11.001591	2026-01-02 14:04:11.001591	0.00	\N
5f1ba6f4-c204-49e9-80e5-7168f3dfb8a8	KU260102-0013	7136d6c5-245b-421b-9bbb-84c637cf1577	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2026-01-02	14:20:48	2026-01-02 12:20:48.487	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-02 14:20:48.488153	2026-01-02 14:20:48.488153	0.00	\N
94a7653c-654c-4493-8c8b-d459a8b41035	KU260102-0015	7136d6c5-245b-421b-9bbb-84c637cf1577	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2026-01-02	15:04:45	2026-01-02 13:04:45.391	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-02 15:04:45.392152	2026-01-02 15:04:45.392152	0.00	\N
ee5719bf-1a76-4e99-8e9d-7735c2c2ae7b	KU260102-0017	40d63f00-ddc5-4f8c-aa25-cd57c5e237de	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2026-01-02	15:55:07	2026-01-02 13:55:07.82	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-02 15:55:07.824576	2026-01-02 15:55:07.824576	0.00	\N
894baf9c-70ef-48a0-adce-af9136140a90	KU260102-0018	8264a667-ae81-48b9-84fd-d795f170737c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1400.00	USD	CASH	PAID	2026-01-02	16:08:33	2026-01-02 14:08:33.353	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-02 16:08:33.354942	2026-01-02 16:08:33.354942	0.00	\N
d4f47f14-ebc6-4855-b263-410e85a0aefa	KU260103-0007	f3d21b8c-c1d8-415f-ab1e-6307eb765b77	6204b8eb-b190-4992-ad03-4dbb161cfff2	1000.00	USD	CASH	PENDING	2026-01-03	10:00:33	\N	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-03 10:00:33.810557	2026-01-03 10:00:33.810557	0.00	\N
d870816c-89cd-4590-8c41-4106b1ab5767	KU260103-0006	d9fedfe6-0d89-49fe-b06c-97529354a88c	6204b8eb-b190-4992-ad03-4dbb161cfff2	1000.00	USD	CASH	PAID	2026-01-03	09:19:36	2026-01-03 08:35:31.51	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-03 09:19:36.440183	2026-01-03 10:35:31.51279	0.00	\N
3526dea1-550f-4658-a8e5-13acf038d7bf	KU260103-0003	8264a667-ae81-48b9-84fd-d795f170737c	6204b8eb-b190-4992-ad03-4dbb161cfff2	200.00	USD	CASH	PAID	2026-01-03	09:18:00	2026-01-03 08:41:55.767	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-03 09:18:00.99535	2026-01-03 10:41:55.769525	0.00	\N
ceedce13-f596-4f86-a4dc-95ae1909fbcf	KU260103-0008	8264a667-ae81-48b9-84fd-d795f170737c	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2026-01-03	10:42:58	2026-01-03 08:42:58.931	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-03 10:42:58.93422	2026-01-03 10:42:58.93422	0.00	\N
927e2bd0-3e3f-4c35-9c40-8ed34274aa95	KU260103-0009	e21cbb1d-137a-4ed8-b5e4-00e828e9f278	53e3741b-51ee-4d66-9f6b-33ecabd8b463	630.00	USD	CASH	PAID	2026-01-03	11:38:35	2026-01-03 09:38:35.748	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-03 11:38:35.750651	2026-01-03 11:38:35.750651	0.00	\N
1f599ef3-7930-4836-8557-5482059daac0	KU260103-0010	d9a941c2-1f0f-42e0-b2cf-b39c1e6d0e84	02a25259-aec1-4f90-ac51-d302eb267d3a	250.00	USD	CASH	PAID	2026-01-03	12:34:23	2026-01-03 10:34:23.285	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-03 12:34:23.287274	2026-01-03 12:34:23.287274	0.00	\N
f0420d64-cd36-4c36-a3f2-8caa59805a34	KU260103-0012	4700bec5-6fb9-4f8e-ad4e-6b09f81df49a	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PENDING	2026-01-03	12:58:39	\N	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-03 12:58:39.732648	2026-01-03 12:58:39.732648	0.00	\N
cd6bdfd3-f032-4fc9-9c34-0320adf43d9b	KU260103-0015	5515cbf4-6ee1-435a-aeb4-5e433cc31cd0	53e3741b-51ee-4d66-9f6b-33ecabd8b463	200.00	USD	CASH	PAID	2026-01-03	15:54:27	2026-01-03 13:54:27.726	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-03 15:54:27.726996	2026-01-03 15:54:27.726996	0.00	\N
b58b6b55-4dfe-4b71-86ac-0fa5abeeddee	KU260105-0002	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PENDING	2026-01-05	10:01:08	\N	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-05 10:01:08.699711	2026-01-05 10:01:08.699711	0.00	\N
b3d058d3-0839-4f54-9b67-e35c110a8010	KU260105-0003	9f5aed3b-a66e-4b40-acae-7a21ced33164	02a25259-aec1-4f90-ac51-d302eb267d3a	500.00	USD	CASH	PAID	2026-01-05	10:02:10	2026-01-05 08:02:10.689	\N	JUB	Sarah Lado	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-05 10:02:10.69676	2026-01-05 10:02:10.69676	0.00	\N
b852b463-4d3f-480d-bc9b-b8653f71deb1	KU260105-0004	86b93c70-e8e1-4bce-8182-c626b082b8bf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	10000.00	USD	CASH	PENDING	2026-01-05	10:12:50	\N	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-05 10:12:50.931176	2026-01-05 10:12:50.931176	0.00	\N
30852c23-b196-4a89-81e7-c11458def185	KU260103-0002	9f5aed3b-a66e-4b40-acae-7a21ced33164	6204b8eb-b190-4992-ad03-4dbb161cfff2	300.00	USD	CASH	PAID	2026-01-03	09:17:50	2026-01-05 08:19:46.731	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-03 09:17:50.647214	2026-01-05 10:19:46.734971	0.00	\N
079fc4eb-b02f-4f8f-999e-5c090a5006e8	KU260105-0005	4409d9cb-e256-4088-99ee-8a257cac99bf	53e3741b-51ee-4d66-9f6b-33ecabd8b463	330.00	USD	CASH	PAID	2026-01-05	10:58:20	2026-01-05 08:58:20.384	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-05 10:58:20.385938	2026-01-05 10:58:20.385938	0.00	\N
bf241a2c-f0af-49d0-a97d-70a014eabd4a	KU260105-0006	8e34184e-2091-4691-a5dc-329a22d316e9	53e3741b-51ee-4d66-9f6b-33ecabd8b463	300.00	USD	CASH	PAID	2026-01-05	11:16:43	2026-01-05 09:16:43.554	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-05 11:16:43.555119	2026-01-05 11:16:43.555119	0.00	\N
00e82a33-f61f-4651-8f18-8f889b996c83	KU260103-0005	568324bd-0670-46b0-a448-49986d773d95	6204b8eb-b190-4992-ad03-4dbb161cfff2	500.00	USD	CASH	PAID	2026-01-03	09:18:57	2026-01-05 12:56:59.589	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-03 09:18:57.147835	2026-01-05 14:56:59.590474	0.00	\N
fa22aa16-c8ff-432e-b858-4f86828fccb6	KU260102-0010	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2026-01-02	13:17:12	2026-01-05 12:57:09.119	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-02 13:17:12.568484	2026-01-05 14:57:09.120032	0.00	\N
3a65bd6f-a1e2-4be4-8b91-2e8a6c3363de	KU260102-0016	0f639da7-b8ae-4671-a1ce-d66c76169567	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2026-01-02	15:16:36	2026-01-05 12:59:09.904	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-02 15:16:36.80057	2026-01-05 14:59:09.904882	0.00	\N
e6c84ce7-4da3-4baf-a88f-bff29f6e1770	KU260102-0014	f1a649dc-16a2-4253-b936-355894b25d72	53e3741b-51ee-4d66-9f6b-33ecabd8b463	700.00	USD	CASH	PAID	2026-01-02	15:01:34	2026-01-05 12:59:19.022	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-02 15:01:34.087661	2026-01-05 14:59:19.023209	0.00	\N
457ddfee-0a7b-4f5e-ad4f-17de1bf017dc	KU260102-0011	92988962-c192-4f5c-8cdc-a0d063110479	6204b8eb-b190-4992-ad03-4dbb161cfff2	200.00	USD	CASH	PAID	2026-01-02	13:45:48	2026-01-05 12:59:27.823	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-02 13:45:48.69394	2026-01-05 14:59:27.823812	0.00	\N
965f3f5c-27e6-4477-bbba-a5747e6fda0b	KU260102-0005	c21e9a75-8949-49c2-b2c9-ff6c316fae26	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2026-01-02	11:19:03	2026-01-05 12:59:45.736	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-02 11:19:03.476057	2026-01-05 14:59:45.736989	0.00	\N
e827448e-3518-42d5-99c1-1f8610925304	KU260103-0014	6412f7f3-44c0-406a-aeb4-c08e4a4a3e94	53e3741b-51ee-4d66-9f6b-33ecabd8b463	500.00	USD	CASH	PAID	2026-01-03	15:31:27	2026-01-05 13:13:18.439	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-03 15:31:27.277196	2026-01-05 15:13:18.440164	0.00	\N
c901258d-c126-488b-8b07-e525ef4fe1df	KU260103-0011	f1a649dc-16a2-4253-b936-355894b25d72	6204b8eb-b190-4992-ad03-4dbb161cfff2	800.00	USD	CASH	PAID	2026-01-03	12:52:08	2026-01-05 13:13:30.27	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-03 12:52:08.772466	2026-01-05 15:13:30.270898	0.00	\N
03db14fb-a982-4c6c-b917-d1b88d5f1dda	KU260103-0004	7627a189-2adf-4bea-8bb0-dcd113b9c865	6204b8eb-b190-4992-ad03-4dbb161cfff2	2500.00	USD	CASH	PAID	2026-01-03	09:18:44	2026-01-05 13:13:51.587	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-03 09:18:44.28685	2026-01-05 15:13:51.588057	0.00	\N
a7f964d1-c300-452a-a4cf-d791096498cf	KU260103-0001	dba747bc-6b58-44b5-9c5a-88376604bf41	6204b8eb-b190-4992-ad03-4dbb161cfff2	500.00	USD	CASH	PAID	2026-01-03	09:17:36	2026-01-05 13:14:20.816	\N	JUB	Mohamed Saeed	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-03 09:17:36.826103	2026-01-05 15:14:20.817082	0.00	\N
120fba99-e684-470a-850f-f8d5810e8c59	KU260103-0013	970181ef-e333-4707-b74c-f6818f947fd6	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2026-01-03	15:28:54	2026-01-05 13:17:58.611	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-03 15:28:54.824657	2026-01-05 15:17:58.611695	0.00	\N
c446606d-ab19-4ddb-9995-f48f88a35b64	KU260105-0007	d473a0f4-eff5-41bf-a301-8c9f74d55b4b	53e3741b-51ee-4d66-9f6b-33ecabd8b463	100.00	USD	CASH	PAID	2026-01-05	11:28:46	2026-01-05 09:28:46.272	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-05 11:28:46.276422	2026-01-05 11:28:46.276422	0.00	\N
5a7826fa-b28d-4137-8cc3-d465474985bd	KU260105-0008	7627a189-2adf-4bea-8bb0-dcd113b9c865	53e3741b-51ee-4d66-9f6b-33ecabd8b463	2200.00	USD	CASH	PAID	2026-01-05	12:41:38	2026-01-05 10:41:38.911	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-05 12:41:38.911941	2026-01-05 12:41:38.911941	0.00	\N
733d93d9-1fc1-47c9-9dfa-455af7d5e295	KU260105-0009	84852b83-ffcb-411d-be4b-3c194a999d68	53e3741b-51ee-4d66-9f6b-33ecabd8b463	400.00	USD	CASH	PAID	2026-01-05	13:30:09	2026-01-05 11:30:09.628	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-05 13:30:09.629866	2026-01-05 13:30:09.629866	0.00	\N
d7cb8fbc-0d8e-4941-881c-fef2086affc1	KU260105-0010	3276bf6c-e1cc-4791-9e0d-44d6a9966ba4	53e3741b-51ee-4d66-9f6b-33ecabd8b463	120.00	USD	CASH	PAID	2026-01-05	13:38:52	2026-01-05 11:38:52.849	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-05 13:38:52.850929	2026-01-05 13:38:52.850929	0.00	\N
a73f91d6-277b-4d48-b044-ef5a0e1bbebc	KU260105-0001	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PAID	2026-01-05	08:09:52	2026-01-05 12:56:21.107	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-05 08:09:52.63136	2026-01-05 14:56:21.108248	0.00	\N
cf498add-1c50-4972-833e-75209487717a	KU260105-0011	568324bd-0670-46b0-a448-49986d773d95	53e3741b-51ee-4d66-9f6b-33ecabd8b463	1000.00	USD	CASH	PENDING	2026-01-05	14:58:02	\N	\N	JUB	Ahmed Sami	Agency Credit Account Deposit		\N	\N	t	f	\N	\N	2026-01-05 14:58:02.839784	2026-01-05 14:58:02.839784	0.00	\N
\.


--
-- Data for Name: sales_agents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sales_agents (id, agent_code, agent_name, station_id, is_active, created_at, updated_at) FROM stdin;
a1e9a9a2-3194-4665-874d-09f2d303fea1	MAK01	OMAN OKONG	a85bcc39-74ee-421e-90a4-0f3123dc0e95	t	2026-01-01 10:09:31.02132	2026-01-01 10:09:31.02132
\.


--
-- Data for Name: settlement_agent_entries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.settlement_agent_entries (id, settlement_id, agent_id, currency, expected_cash, declared_cash, variance, variance_status, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: settlement_audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.settlement_audit_logs (id, settlement_id, user_id, action, field_changed, old_value, new_value, notes, ip_address, created_at) FROM stdin;
\.


--
-- Data for Name: settlement_expenses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.settlement_expenses (id, settlement_id, expense_code_id, currency, amount, description, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: settlement_summaries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.settlement_summaries (id, settlement_id, currency, opening_balance, opening_balance_settlement_id, expected_cash, total_expenses, expected_net_cash, actual_cash_received, final_variance, variance_status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: settlements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.settlements (id, settlement_number, station_id, period_from, period_to, status, created_by, submitted_by, submitted_at, reviewed_by, reviewed_at, approval_type, approval_notes, rejection_reason, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: station_sales; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.station_sales (id, sale_reference, station_id, agent_id, transaction_date, transaction_time, flight_reference, amount, currency, payment_method, customer_name, description, settlement_id, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: stations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.stations (id, station_code, station_name, currencies_allowed, is_active, created_at, updated_at) FROM stdin;
d651fccf-0df7-4104-bac2-4079ca0684a0	EBB	Entebbe	{USD}	t	2026-01-01 09:38:25.891119	2026-01-05 11:08:28.410008
2a05e6c5-30b7-49dc-a4e4-cf947d5233c5	JUB	Juba	{USD,SSP}	t	2026-01-01 09:38:25.891119	2026-01-05 11:08:56.168563
a85bcc39-74ee-421e-90a4-0f3123dc0e95	MAK	Malakal	{USD,SSP}	t	2026-01-01 10:08:30.608028	2026-01-05 11:09:12.553775
35c87796-90bc-4af6-ac8e-25c8b2889564	BE1	Bentiu	{USD,SSP}	t	2026-01-05 11:09:33.958795	2026-01-05 11:09:33.958795
915711bf-743d-4219-aefa-ad96ce474569	AW1	Aweil	{USD,SSP}	t	2026-01-05 11:09:47.568745	2026-01-05 11:09:47.568745
0262fc82-3a6a-4eb6-bb22-807df7612f12	WUU	WAU	{USD,SSP}	t	2026-01-05 11:09:57.404285	2026-01-05 11:09:57.404285
9c57df04-69ca-4c64-9612-e9d1e5311b44	YB1	Yambio	{USD,SSP}	t	2026-01-05 11:10:21.769578	2026-01-05 11:10:21.769578
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, name, password_hash, employee_id, station_code, role, phone, is_active, created_at, updated_at, username) FROM stdin;
6204b8eb-b190-4992-ad03-4dbb161cfff2	mohamed.saeed@kushair.net	Mohamed Saeed	$2b$10$IQYdn91wnLA6KvH72tPb4.uCqP2pjaE18PDOGcXLnsY.wL8M7E0Va	ADM-001	JUB	admin	+211929754555	t	2025-11-13 15:05:45.527393	2025-11-13 15:05:45.527393	mohamed.saeed
fe5cc798-8cc6-456b-8a61-74431d612b55	sarah.lado@kushair.net	Sarah Lado	$2b$10$FB.zwsJ1hrHSNXcxOCZ5UedAAfWKu0kTfOG89nevQD8llWvaumeb6	STF-003	JUB	staff	+211929754557	f	2025-11-13 15:05:45.615668	2025-11-14 10:47:28.894051	sarah2
02a25259-aec1-4f90-ac51-d302eb267d3a	sarah@kushair.net	Sarah Lado	$2b$10$FGLPmjtCtL.94oT5BB9lbOwP3iidU2zU7kYmzrPaaA22GcjJ0N8/G	KU003	JUB	manager	+211929754555	t	2025-11-14 10:46:54.884562	2025-11-14 13:00:51.844584	sarah
f9feadf8-2d97-4ab7-b4bb-66f47a56fe1c	testadmin@kushair.net	Test Admin	$2b$10$8c7cSCdwTXLkpb9MzPKJH.7P1UsQxLZvQjJAJz2JGr8.bknQod5ce	\N	JUB	admin	\N	t	2026-01-01 09:44:46.499479	2026-01-01 09:44:46.499479	\N
53e3741b-51ee-4d66-9f6b-33ecabd8b463	ahmed.sami@kushair.net	Ahmed Sami	$2b$10$xDXi704QuamYvG2NOC7tk.g6IfSR47j5Uqf.e66QBB1Y2tNNJ3tkm	STF-002	JUB	admin	+211929754556	t	2025-11-13 15:05:45.574786	2026-01-01 10:07:40.174397	asami
\.


--
-- Name: payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.payments_id_seq', 25, true);


--
-- Name: agencies agencies_agency_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agencies
    ADD CONSTRAINT agencies_agency_id_key UNIQUE (agency_id);


--
-- Name: agencies agencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agencies
    ADD CONSTRAINT agencies_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: expense_codes expense_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_codes
    ADD CONSTRAINT expense_codes_code_key UNIQUE (code);


--
-- Name: expense_codes expense_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_codes
    ADD CONSTRAINT expense_codes_pkey PRIMARY KEY (id);


--
-- Name: offline_queue offline_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_queue
    ADD CONSTRAINT offline_queue_pkey PRIMARY KEY (id);


--
-- Name: payments payments_payment_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_payment_number_key UNIQUE (payment_number);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: receipts receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_pkey PRIMARY KEY (id);


--
-- Name: receipts receipts_receipt_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_receipt_number_key UNIQUE (receipt_number);


--
-- Name: sales_agents sales_agents_agent_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_agents
    ADD CONSTRAINT sales_agents_agent_code_key UNIQUE (agent_code);


--
-- Name: sales_agents sales_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_agents
    ADD CONSTRAINT sales_agents_pkey PRIMARY KEY (id);


--
-- Name: settlement_agent_entries settlement_agent_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_agent_entries
    ADD CONSTRAINT settlement_agent_entries_pkey PRIMARY KEY (id);


--
-- Name: settlement_agent_entries settlement_agent_entries_settlement_id_agent_id_currency_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_agent_entries
    ADD CONSTRAINT settlement_agent_entries_settlement_id_agent_id_currency_key UNIQUE (settlement_id, agent_id, currency);


--
-- Name: settlement_audit_logs settlement_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_audit_logs
    ADD CONSTRAINT settlement_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: settlement_expenses settlement_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_expenses
    ADD CONSTRAINT settlement_expenses_pkey PRIMARY KEY (id);


--
-- Name: settlement_summaries settlement_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_summaries
    ADD CONSTRAINT settlement_summaries_pkey PRIMARY KEY (id);


--
-- Name: settlement_summaries settlement_summaries_settlement_id_currency_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_summaries
    ADD CONSTRAINT settlement_summaries_settlement_id_currency_key UNIQUE (settlement_id, currency);


--
-- Name: settlements settlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlements
    ADD CONSTRAINT settlements_pkey PRIMARY KEY (id);


--
-- Name: settlements settlements_settlement_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlements
    ADD CONSTRAINT settlements_settlement_number_key UNIQUE (settlement_number);


--
-- Name: station_sales station_sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_sales
    ADD CONSTRAINT station_sales_pkey PRIMARY KEY (id);


--
-- Name: station_sales station_sales_sale_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_sales
    ADD CONSTRAINT station_sales_sale_reference_key UNIQUE (sale_reference);


--
-- Name: stations stations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_pkey PRIMARY KEY (id);


--
-- Name: stations stations_station_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_station_code_key UNIQUE (station_code);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_employee_id_key UNIQUE (employee_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: idx_agencies_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agencies_active ON public.agencies USING btree (is_active);


--
-- Name: idx_agencies_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agencies_id ON public.agencies USING btree (agency_id);


--
-- Name: idx_agencies_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agencies_name ON public.agencies USING btree (agency_name);


--
-- Name: idx_offline_queue_sync; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_offline_queue_sync ON public.offline_queue USING btree (is_synced, created_at);


--
-- Name: idx_payments_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_created_at ON public.payments USING btree (created_at DESC);


--
-- Name: idx_payments_receipt_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_receipt_id ON public.payments USING btree (receipt_id);


--
-- Name: idx_receipts_agency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receipts_agency ON public.receipts USING btree (agency_id);


--
-- Name: idx_receipts_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receipts_date ON public.receipts USING btree (issue_date DESC);


--
-- Name: idx_receipts_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receipts_number ON public.receipts USING btree (receipt_number);


--
-- Name: idx_receipts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receipts_status ON public.receipts USING btree (status);


--
-- Name: idx_receipts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receipts_user ON public.receipts USING btree (user_id);


--
-- Name: idx_sales_agents_station; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_agents_station ON public.sales_agents USING btree (station_id);


--
-- Name: idx_settlement_agent_entries_settlement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settlement_agent_entries_settlement ON public.settlement_agent_entries USING btree (settlement_id);


--
-- Name: idx_settlement_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settlement_audit_created ON public.settlement_audit_logs USING btree (created_at DESC);


--
-- Name: idx_settlement_audit_settlement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settlement_audit_settlement ON public.settlement_audit_logs USING btree (settlement_id);


--
-- Name: idx_settlement_expenses_settlement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settlement_expenses_settlement ON public.settlement_expenses USING btree (settlement_id);


--
-- Name: idx_settlement_summaries_settlement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settlement_summaries_settlement ON public.settlement_summaries USING btree (settlement_id);


--
-- Name: idx_settlements_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settlements_period ON public.settlements USING btree (period_from, period_to);


--
-- Name: idx_settlements_station; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settlements_station ON public.settlements USING btree (station_id);


--
-- Name: idx_settlements_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settlements_status ON public.settlements USING btree (status);


--
-- Name: idx_station_sales_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_station_sales_agent ON public.station_sales USING btree (agent_id);


--
-- Name: idx_station_sales_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_station_sales_date ON public.station_sales USING btree (transaction_date);


--
-- Name: idx_station_sales_settlement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_station_sales_settlement ON public.station_sales USING btree (settlement_id);


--
-- Name: idx_station_sales_station; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_station_sales_station ON public.station_sales USING btree (station_id);


--
-- Name: idx_station_sales_unsettled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_station_sales_unsettled ON public.station_sales USING btree (station_id, transaction_date) WHERE (settlement_id IS NULL);


--
-- Name: settlement_agent_entries trg_calculate_agent_variance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_calculate_agent_variance BEFORE INSERT OR UPDATE ON public.settlement_agent_entries FOR EACH ROW EXECUTE FUNCTION public.calculate_agent_variance();


--
-- Name: settlements trg_check_settlement_overlap; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_check_settlement_overlap BEFORE INSERT OR UPDATE ON public.settlements FOR EACH ROW EXECUTE FUNCTION public.check_settlement_overlap();


--
-- Name: audit_logs audit_logs_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.receipts(id);


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: offline_queue offline_queue_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_queue
    ADD CONSTRAINT offline_queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: payments payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: payments payments_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.receipts(id) ON DELETE CASCADE;


--
-- Name: receipts receipts_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE RESTRICT;


--
-- Name: receipts receipts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: sales_agents sales_agents_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_agents
    ADD CONSTRAINT sales_agents_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE SET NULL;


--
-- Name: settlement_agent_entries settlement_agent_entries_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_agent_entries
    ADD CONSTRAINT settlement_agent_entries_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.sales_agents(id);


--
-- Name: settlement_agent_entries settlement_agent_entries_settlement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_agent_entries
    ADD CONSTRAINT settlement_agent_entries_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES public.settlements(id) ON DELETE CASCADE;


--
-- Name: settlement_audit_logs settlement_audit_logs_settlement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_audit_logs
    ADD CONSTRAINT settlement_audit_logs_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES public.settlements(id) ON DELETE CASCADE;


--
-- Name: settlement_audit_logs settlement_audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_audit_logs
    ADD CONSTRAINT settlement_audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: settlement_expenses settlement_expenses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_expenses
    ADD CONSTRAINT settlement_expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: settlement_expenses settlement_expenses_expense_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_expenses
    ADD CONSTRAINT settlement_expenses_expense_code_id_fkey FOREIGN KEY (expense_code_id) REFERENCES public.expense_codes(id);


--
-- Name: settlement_expenses settlement_expenses_settlement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_expenses
    ADD CONSTRAINT settlement_expenses_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES public.settlements(id) ON DELETE CASCADE;


--
-- Name: settlement_summaries settlement_summaries_opening_balance_settlement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_summaries
    ADD CONSTRAINT settlement_summaries_opening_balance_settlement_id_fkey FOREIGN KEY (opening_balance_settlement_id) REFERENCES public.settlements(id);


--
-- Name: settlement_summaries settlement_summaries_settlement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_summaries
    ADD CONSTRAINT settlement_summaries_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES public.settlements(id) ON DELETE CASCADE;


--
-- Name: settlements settlements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlements
    ADD CONSTRAINT settlements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: settlements settlements_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlements
    ADD CONSTRAINT settlements_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: settlements settlements_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlements
    ADD CONSTRAINT settlements_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id);


--
-- Name: settlements settlements_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlements
    ADD CONSTRAINT settlements_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.users(id);


--
-- Name: station_sales station_sales_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_sales
    ADD CONSTRAINT station_sales_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.sales_agents(id);


--
-- Name: station_sales station_sales_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_sales
    ADD CONSTRAINT station_sales_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: station_sales station_sales_settlement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_sales
    ADD CONSTRAINT station_sales_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES public.settlements(id) ON DELETE SET NULL;


--
-- Name: station_sales station_sales_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_sales
    ADD CONSTRAINT station_sales_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id);


--
-- PostgreSQL database dump complete
--

\unrestrict FGWninHoOWWevNgEd54xY0qCyvrN8fWnbq3dqHCvCKBZQ6WMcsxpaDh5aJuEi8Z

