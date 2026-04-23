
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  try {
    const { httpMethod, body } = event;

    if (httpMethod === 'GET') {
      const { data, error } = await supabase.from('tickets').select('*');
      if (error) throw error;

      return {
        statusCode: 200,
        body: JSON.stringify(data)
      };
    }

    if (httpMethod === 'POST') {
      const ticket = JSON.parse(body);

      const { data, error } = await supabase
        .from('tickets')
        .insert([ticket])
        .select();

      if (error) throw error;

      return {
        statusCode: 200,
        body: JSON.stringify(data)
      };
    }

    return { statusCode: 405 };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}
