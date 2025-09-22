--
-- PostgreSQL database initialization script
-- Generated from running database schema dump
--

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

SET default_tablespace = '';
SET default_table_access_method = heap;

--
-- Name: __EFMigrationsHistory; Type: TABLE; Schema: public; Owner: wbb_user
--

CREATE TABLE IF NOT EXISTS public."__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL
);

--
-- Name: users; Type: TABLE; Schema: public; Owner: wbb_user
--

CREATE TABLE IF NOT EXISTS public.users (
    id uuid NOT NULL,
    subjectid character varying(255) NOT NULL,
    username character varying(255),
    email character varying(255),
    name character varying(255),
    displayname character varying(255) NOT NULL,
    timezone character varying(100),
    theme character varying(20) DEFAULT 'auto'::character varying NOT NULL,
    createdat timestamp with time zone DEFAULT now() NOT NULL,
    lastloginat timestamp with time zone DEFAULT now() NOT NULL,
    isactive boolean DEFAULT true NOT NULL
);

--
-- Name: boards; Type: TABLE; Schema: public; Owner: wbb_user
--

CREATE TABLE IF NOT EXISTS public.boards (
    id uuid NOT NULL,
    name character varying(255) NOT NULL,
    createdat timestamp with time zone DEFAULT now() NOT NULL,
    updatedat timestamp with time zone DEFAULT now() NOT NULL,
    ispublic boolean DEFAULT false NOT NULL,
    adminpin character varying(100),
    ownerid uuid NOT NULL,
    accesslevel integer DEFAULT 1 NOT NULL,
    "Emoji" text DEFAULT '📋'::text NOT NULL
);

--
-- Name: boardelements; Type: TABLE; Schema: public; Owner: wbb_user
--

CREATE TABLE IF NOT EXISTS public.boardelements (
    id uuid NOT NULL,
    boardid uuid NOT NULL,
    type character varying(50) NOT NULL,
    x double precision NOT NULL,
    y double precision NOT NULL,
    width double precision,
    height double precision,
    zindex integer NOT NULL,
    createdby character varying(100),
    createdbyuserid uuid NOT NULL,
    modifiedbyuserid uuid,
    createdat timestamp with time zone DEFAULT now() NOT NULL,
    modifiedat timestamp with time zone DEFAULT now() NOT NULL,
    data jsonb,
    groupid uuid,
    grouporder integer
);

--
-- Name: boardcollaborators; Type: TABLE; Schema: public; Owner: wbb_user
--

CREATE TABLE IF NOT EXISTS public.boardcollaborators (
    boardid uuid NOT NULL,
    userid uuid NOT NULL,
    role integer NOT NULL,
    grantedat timestamp with time zone DEFAULT now() NOT NULL,
    grantedbyuserid uuid
);

--
-- PRIMARY KEY CONSTRAINTS
--

ALTER TABLE ONLY public."__EFMigrationsHistory"
    ADD CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId");

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_users" PRIMARY KEY (id);

ALTER TABLE ONLY public.boards
    ADD CONSTRAINT "PK_boards" PRIMARY KEY (id);

ALTER TABLE ONLY public.boardelements
    ADD CONSTRAINT "PK_boardelements" PRIMARY KEY (id);

ALTER TABLE ONLY public.boardcollaborators
    ADD CONSTRAINT "PK_boardcollaborators" PRIMARY KEY (boardid, userid);

--
-- INDEXES
--

CREATE UNIQUE INDEX IF NOT EXISTS "IX_users_subjectid" ON public.users USING btree (subjectid);
CREATE INDEX IF NOT EXISTS "IX_users_email" ON public.users USING btree (email);
CREATE INDEX IF NOT EXISTS "IX_users_username" ON public.users USING btree (username);

CREATE INDEX IF NOT EXISTS "IX_boards_ownerid" ON public.boards USING btree (ownerid);
CREATE INDEX IF NOT EXISTS "IX_boards_accesslevel" ON public.boards USING btree (accesslevel);

CREATE INDEX IF NOT EXISTS "IX_boardelements_boardid" ON public.boardelements USING btree (boardid);
CREATE INDEX IF NOT EXISTS "IX_boardelements_type" ON public.boardelements USING btree (type);
CREATE INDEX IF NOT EXISTS "IX_boardelements_createdbyuserid" ON public.boardelements USING btree (createdbyuserid);
CREATE INDEX IF NOT EXISTS "IX_boardelements_modifiedbyuserid" ON public.boardelements USING btree (modifiedbyuserid);
CREATE INDEX IF NOT EXISTS "IX_boardelements_groupid" ON public.boardelements USING btree (groupid);

CREATE INDEX IF NOT EXISTS "IX_boardcollaborators_userid" ON public.boardcollaborators USING btree (userid);
CREATE INDEX IF NOT EXISTS "IX_boardcollaborators_role" ON public.boardcollaborators USING btree (role);
CREATE INDEX IF NOT EXISTS "IX_boardcollaborators_grantedbyuserid" ON public.boardcollaborators USING btree (grantedbyuserid);

--
-- FOREIGN KEY CONSTRAINTS
--

ALTER TABLE ONLY public.boards
    ADD CONSTRAINT "FK_boards_users_ownerid" FOREIGN KEY (ownerid) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.boardelements
    ADD CONSTRAINT "FK_boardelements_boards_boardid" FOREIGN KEY (boardid) REFERENCES public.boards(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.boardelements
    ADD CONSTRAINT "FK_boardelements_users_createdbyuserid" FOREIGN KEY (createdbyuserid) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.boardelements
    ADD CONSTRAINT "FK_boardelements_users_modifiedbyuserid" FOREIGN KEY (modifiedbyuserid) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.boardcollaborators
    ADD CONSTRAINT "FK_boardcollaborators_boards_boardid" FOREIGN KEY (boardid) REFERENCES public.boards(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.boardcollaborators
    ADD CONSTRAINT "FK_boardcollaborators_users_userid" FOREIGN KEY (userid) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.boardcollaborators
    ADD CONSTRAINT "FK_boardcollaborators_users_grantedbyuserid" FOREIGN KEY (grantedbyuserid) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- INSERT ESSENTIAL DATA
--

-- Insert anonymous user (required by application)
INSERT INTO public.users (id, subjectid, username, email, name, displayname, timezone, theme, createdat, lastloginat, isactive) 
VALUES (
    '60063565-fc8d-4494-b70f-6a038e081d0a',
    'anonymous-user',
    'anonymous',
    NULL,
    NULL,
    'Guest-2591',
    NULL,
    'auto',
    NOW(),
    NOW(),
    true
) ON CONFLICT (subjectid) DO NOTHING;

-- Insert default test board
INSERT INTO public.boards (id, name, createdat, updatedat, ispublic, adminpin, ownerid, accesslevel, "Emoji") 
VALUES (
    '51c99618-a2f3-4430-8df9-c03711048c9b',
    'test',
    NOW(),
    NOW(),
    true,
    NULL,
    '60063565-fc8d-4494-b70f-6a038e081d0a',
    3,
    '📋'
) ON CONFLICT (id) DO NOTHING;