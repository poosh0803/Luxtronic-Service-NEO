import express from 'express';
import pool from '../db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const metrics = await getMetrics();
    res.json({ success: true, metrics });
  } catch (error) {
    console.error('Error fetching analytics data:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch analytics data', error: error.message });
  }
});

async function getMetrics() {
  // Draft (unfinished, auto-saved) records are excluded everywhere below -
  // they aren't real jobs.
  const queries = {
    totalServices: `
      WITH current_period AS (
        SELECT COUNT(*) AS count FROM service_forms
        WHERE status != 'draft' AND created_at >= CURRENT_DATE - INTERVAL '30 day'
      ),
      previous_period AS (
        SELECT COUNT(*) AS count FROM service_forms
        WHERE status != 'draft' AND created_at >= CURRENT_DATE - INTERVAL '60 day'
          AND created_at < CURRENT_DATE - INTERVAL '30 day'
      )
      SELECT
        current_period.count AS current_count,
        ROUND(((current_period.count - previous_period.count) / NULLIF(previous_period.count, 0)::numeric * 100), 1) AS percentage_change
      FROM current_period, previous_period
    `,
    dailyAverageServices: `
      WITH current_period AS (
        SELECT COUNT(*) / 30.0 AS avg_per_day FROM service_forms
        WHERE status != 'draft' AND created_at >= CURRENT_DATE - INTERVAL '30 day'
      ),
      previous_period AS (
        SELECT COUNT(*) / 30.0 AS avg_per_day FROM service_forms
        WHERE status != 'draft' AND created_at >= CURRENT_DATE - INTERVAL '60 day'
          AND created_at < CURRENT_DATE - INTERVAL '30 day'
      )
      SELECT
        ROUND(current_period.avg_per_day, 1) AS current_avg,
        ROUND(((current_period.avg_per_day - previous_period.avg_per_day) / NULLIF(previous_period.avg_per_day, 0) * 100), 1) AS percentage_change
      FROM current_period, previous_period
    `,
    statusBreakdown: `
      SELECT status, COUNT(*) AS count
      FROM service_forms
      WHERE status != 'draft'
      GROUP BY status
    `,
    mostPopularDevice: `
      SELECT model AS device, COUNT(*) AS count,
             ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM service_forms WHERE status != 'draft'), 0), 0) AS percentage
      FROM service_forms
      WHERE status != 'draft' AND model IS NOT NULL AND model != '' AND created_at >= CURRENT_DATE - INTERVAL '30 day'
      GROUP BY model
      ORDER BY count DESC
      LIMIT 1
    `,
    mostPopularBrand: `
      SELECT brand, COUNT(*) AS count,
             ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM service_forms WHERE status != 'draft'), 0), 0) AS percentage
      FROM service_forms
      WHERE status != 'draft' AND brand IS NOT NULL AND brand != '' AND created_at >= CURRENT_DATE - INTERVAL '30 day'
      GROUP BY brand
      ORDER BY count DESC
      LIMIT 1
    `,
    monthlyTrends: `
      WITH RECURSIVE months AS (
        SELECT 1 AS month
        UNION ALL
        SELECT month + 1 FROM months WHERE month < 12
      ),
      monthly_counts AS (
        SELECT EXTRACT(MONTH FROM created_at) AS month, COUNT(*) AS count
        FROM service_forms
        WHERE status != 'draft' AND created_at >= CURRENT_DATE - INTERVAL '12 month'
        GROUP BY EXTRACT(MONTH FROM created_at)
      )
      SELECT
        m.month,
        COALESCE(mc.count, 0) AS count,
        ROUND(COALESCE(mc.count, 0) * 100.0 / NULLIF((SELECT COUNT(*) FROM service_forms WHERE status != 'draft' AND created_at >= CURRENT_DATE - INTERVAL '12 month'), 0), 1) AS percentage
      FROM months m
      LEFT JOIN monthly_counts mc ON m.month = mc.month
      ORDER BY m.month
    `,
    popularServiceDays: `
      WITH all_days AS (
        SELECT 1 AS day_number, 'Monday' AS day_name
        UNION ALL SELECT 2, 'Tuesday'
        UNION ALL SELECT 3, 'Wednesday'
        UNION ALL SELECT 4, 'Thursday'
        UNION ALL SELECT 5, 'Friday'
        UNION ALL SELECT 6, 'Saturday'
        UNION ALL SELECT 7, 'Sunday'
      ),
      day_counts AS (
        SELECT EXTRACT(ISODOW FROM created_at) AS day_number, COUNT(*) AS count
        FROM service_forms
        WHERE status != 'draft' AND created_at >= CURRENT_DATE - INTERVAL '30 day'
        GROUP BY day_number
      )
      SELECT
        day_name,
        COALESCE(count, 0) AS count,
        ROUND(COALESCE(count, 0) * 100.0 / NULLIF((SELECT COUNT(*) FROM service_forms WHERE status != 'draft' AND created_at >= CURRENT_DATE - INTERVAL '30 day'), 0), 1) AS percentage
      FROM all_days d
      LEFT JOIN day_counts dc ON d.day_number = dc.day_number
      ORDER BY d.day_number
    `,
    customerActivityHeatmap: `
      WITH RECURSIVE date_range AS (
        SELECT (CURRENT_DATE - INTERVAL '27 day')::DATE AS date
        UNION ALL
        SELECT (date + INTERVAL '1 day')::DATE FROM date_range WHERE date < CURRENT_DATE
      ),
      activity_data AS (
        SELECT created_at::DATE AS service_date, COUNT(*) AS service_count
        FROM service_forms
        WHERE status != 'draft' AND created_at >= (CURRENT_DATE - INTERVAL '27 day') AND created_at <= NOW()
        GROUP BY created_at::DATE
      ),
      max_count AS (
        SELECT GREATEST(1, MAX(service_count)) AS max_count FROM activity_data
      )
      SELECT
        TO_CHAR(d.date, 'YYYY-MM-DD') AS date,
        EXTRACT(ISODOW FROM d.date) AS day_of_week,
        FLOOR((d.date - (SELECT MIN(date) FROM date_range)) / 7) + 1 AS week_number,
        COALESCE(a.service_count, 0) AS service_count,
        CASE
          WHEN COALESCE(a.service_count, 0) = 0 THEN 0
          WHEN COALESCE(a.service_count, 0) <= (SELECT max_count * 0.25 FROM max_count) THEN 1
          WHEN COALESCE(a.service_count, 0) <= (SELECT max_count * 0.5 FROM max_count) THEN 2
          WHEN COALESCE(a.service_count, 0) <= (SELECT max_count * 0.75 FROM max_count) THEN 3
          ELSE 4
        END AS activity_level
      FROM date_range d
      LEFT JOIN activity_data a ON d.date = a.service_date
      ORDER BY d.date ASC
    `,
    brandDistribution: `
      WITH brand_counts AS (
        SELECT brand, COUNT(*) AS count FROM service_forms
        WHERE status != 'draft' AND brand IS NOT NULL AND brand != ''
        GROUP BY brand
      )
      SELECT brand, count, ROUND(count * 100.0 / (SELECT SUM(count) FROM brand_counts), 1) AS percentage
      FROM brand_counts
      ORDER BY count DESC
      LIMIT 5
    `,
    modelDistribution: `
      WITH model_counts AS (
        SELECT model, COUNT(*) AS count FROM service_forms
        WHERE status != 'draft' AND model IS NOT NULL AND model != ''
        GROUP BY model
      )
      SELECT model, count, ROUND(count * 100.0 / (SELECT SUM(count) FROM model_counts), 1) AS percentage
      FROM model_counts
      ORDER BY count DESC
      LIMIT 5
    `,
  };

  const arrayKeys = ['monthlyTrends', 'popularServiceDays', 'customerActivityHeatmap', 'brandDistribution', 'modelDistribution', 'statusBreakdown'];

  const results = await Promise.all(
    Object.entries(queries).map(async ([key, query]) => {
      const { rows } = await pool.query(query);
      return { key, result: arrayKeys.includes(key) ? rows : rows[0] };
    })
  );

  const metricsData = {};
  results.forEach(({ key, result }) => {
    metricsData[key] = result;
  });

  const statusCounts = { started: 0, finished: 0 };
  (metricsData.statusBreakdown || []).forEach((row) => {
    statusCounts[row.status] = parseInt(row.count, 10);
  });

  return {
    totalServices: {
      value: metricsData.totalServices?.current_count || 0,
      change: metricsData.totalServices?.percentage_change || 0,
    },
    averageDailyServices: {
      value: metricsData.dailyAverageServices?.current_avg || 0,
      change: metricsData.dailyAverageServices?.percentage_change || 0,
    },
    statusCounts,
    mostPopularDevice: {
      device: metricsData.mostPopularDevice?.device || 'N/A',
      percentage: metricsData.mostPopularDevice?.percentage || 0,
    },
    mostPopularBrand: {
      brand: metricsData.mostPopularBrand?.brand || 'N/A',
      percentage: metricsData.mostPopularBrand?.percentage || 0,
    },
    monthlyTrends: metricsData.monthlyTrends || [],
    popularServiceDays: metricsData.popularServiceDays || [],
    customerActivityHeatmap: metricsData.customerActivityHeatmap || [],
    brandDistribution: metricsData.brandDistribution || [],
    modelDistribution: metricsData.modelDistribution || [],
  };
}

export default router;
