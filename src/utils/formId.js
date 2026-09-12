// Issues the next "SF-<year>-<seq>" id, atomically, via an upsert on
// sequence_counter - so two technicians starting a form at the same moment
// never collide.
export async function nextFormId(client) {
  const year = new Date().getFullYear();
  const { rows } = await client.query(
    `INSERT INTO sequence_counter (year, current_value)
     VALUES ($1, 1)
     ON CONFLICT (year) DO UPDATE SET current_value = sequence_counter.current_value + 1
     RETURNING current_value`,
    [year]
  );
  const seq = rows[0].current_value;
  const id = `SF-${year}-${String(seq).padStart(4, '0')}`;
  return { id, year, seq };
}
