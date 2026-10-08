'use strict';
/*
 * Supabase connection.
 * The publishable key is designed to be public: it sits in every visitor's browser.
 * Your data is protected by the Row Level Security policies in supabase/schema.sql, not by hiding this key.
 * NEVER put the secret / service_role key here.
 *
 * Leave both values empty to run in "local mode": no login, data stays in this browser only.
 */
window.APP_CONFIG = {
  supabaseUrl: 'https://getekttkkapbldnvbezp.supabase.co',
  supabaseKey: 'sb_publishable_QulV8pdNg2ZQrMaQNzoSmg_IJLhmMak'
};
