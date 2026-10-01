import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { query } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession(request);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    // ── Guitar category stats ──
    const categoryRows = await query<{
      category: string;
      item_count: number;
      total_value: number;
    }>(`
      WITH latest_per_item AS (
        SELECT DISTINCT ON (guitar_item_id)
          guitar_item_id,
          price
        FROM guitar_valuations
        ORDER BY guitar_item_id, created_at DESC
      )
      SELECT
        gi.category,
        COUNT(gi.id)::int                         AS item_count,
        COALESCE(SUM(lpi.price), 0)::numeric      AS total_value
      FROM guitar_items gi
      LEFT JOIN latest_per_item lpi ON lpi.guitar_item_id = gi.id
      WHERE gi.user_id = $1 AND gi.archived_at IS NULL
      GROUP BY gi.category
      ORDER BY gi.category
    `, [userId]);

    // ── Guitar portfolio totals ──
    const guitarTotals = categoryRows.reduce(
      (acc, r) => ({
        total_items: acc.total_items + r.item_count,
        total_value: acc.total_value + Number(r.total_value),
      }),
      { total_items: 0, total_value: 0 }
    );

    const guitarValuedRows = await query<{ count: number }>(`
      SELECT COUNT(DISTINCT gv.guitar_item_id)::int AS count
      FROM guitar_valuations gv
      JOIN guitar_items gi ON gi.id = gv.guitar_item_id
      WHERE gi.user_id = $1 AND gi.archived_at IS NULL
    `, [userId]);
    const guitar_valued_items = guitarValuedRows[0]?.count ?? 0;

    // ── Watch portfolio totals ──
    const watchTotalsRows = await query<{ total_items: number; total_value: number }>(`
      WITH latest_per_watch AS (
        SELECT DISTINCT ON (watch_item_id)
          watch_item_id,
          price
        FROM watch_valuations
        ORDER BY watch_item_id, created_at DESC
      )
      SELECT
        COUNT(wi.id)::int                         AS total_items,
        COALESCE(SUM(lpw.price), 0)::numeric      AS total_value
      FROM watch_items wi
      LEFT JOIN latest_per_watch lpw ON lpw.watch_item_id = wi.id
      WHERE wi.user_id = $1 AND wi.archived_at IS NULL
    `, [userId]);
    const watchTotals = watchTotalsRows[0] ?? { total_items: 0, total_value: 0 };

    const watchValuedRows = await query<{ count: number }>(`
      SELECT COUNT(DISTINCT wv.watch_item_id)::int AS count
      FROM watch_valuations wv
      JOIN watch_items wi ON wi.id = wv.watch_item_id
      WHERE wi.user_id = $1 AND wi.archived_at IS NULL
    `, [userId]);
    const watch_valued_items = watchValuedRows[0]?.count ?? 0;

    // ── Auto portfolio totals ──
    const autoTotalsRows = await query<{ total_items: number; total_value: number }>(`
      WITH latest_per_auto AS (
        SELECT DISTINCT ON (auto_id)
          auto_id,
          price
        FROM auto_valuations
        ORDER BY auto_id, created_at DESC
      )
      SELECT
        COUNT(a.id)::int                          AS total_items,
        COALESCE(SUM(lpa.price), 0)::numeric      AS total_value
      FROM automobiles a
      LEFT JOIN latest_per_auto lpa ON lpa.auto_id = a.id
      WHERE a.user_id = $1 AND a.archived_at IS NULL
    `, [userId]);
    const autoTotals = autoTotalsRows[0] ?? { total_items: 0, total_value: 0 };

    const autoValuedRows = await query<{ count: number }>(`
      SELECT COUNT(DISTINCT av.auto_id)::int AS count
      FROM auto_valuations av
      JOIN automobiles a ON a.id = av.auto_id
      WHERE a.user_id = $1 AND a.archived_at IS NULL
    `, [userId]);
    const auto_valued_items = autoValuedRows[0]?.count ?? 0;

    // ── IoD portfolio totals ──
    const iodTotalsRows = await query<{ total_items: number; total_value: number }>(`
      WITH latest_per_iod AS (
        SELECT DISTINCT ON (iod_id)
          iod_id,
          price
        FROM iod_valuations
        ORDER BY iod_id, created_at DESC
      )
      SELECT
        COUNT(i.id)::int                          AS total_items,
        COALESCE(SUM(lpi.price), 0)::numeric      AS total_value
      FROM items_of_distinction i
      LEFT JOIN latest_per_iod lpi ON lpi.iod_id = i.id
      WHERE i.user_id = $1 AND i.archived_at IS NULL
    `, [userId]);
    const iodTotals = iodTotalsRows[0] ?? { total_items: 0, total_value: 0 };

    const iodValuedRows = await query<{ count: number }>(`
      SELECT COUNT(DISTINCT iv.iod_id)::int AS count
      FROM iod_valuations iv
      JOIN items_of_distinction i ON i.id = iv.iod_id
      WHERE i.user_id = $1 AND i.archived_at IS NULL
    `, [userId]);
    const iod_valued_items = iodValuedRows[0]?.count ?? 0;

    // ── Most recently added item (all four collections) ──
    const recentRows = await query<{
      id: string;
      brand: string;
      model: string;
      year: number | null;
      category: string;
      collection_type: string;
      subtitle: string | null;
      condition: string;
      created_at: string;
      latest_ai_price: number | null;
      latest_user_price: number | null;
      primary_image_path: string | null;
    }>(`
      SELECT * FROM (
        SELECT
          gi.id,
          gi.brand,
          gi.model,
          gi.year,
          gi.category,
          'guitar'       AS collection_type,
          gi.color_finish AS subtitle,
          gi.condition,
          gi.created_at,
          ai_val.price   AS latest_ai_price,
          user_val.price AS latest_user_price,
          (
            SELECT img.path FROM guitar_images img
            WHERE img.guitar_item_id = gi.id
            ORDER BY img.is_primary DESC, img.sort_order ASC, img.created_at ASC
            LIMIT 1
          ) AS primary_image_path
        FROM guitar_items gi
        LEFT JOIN LATERAL (
          SELECT price FROM guitar_valuations
          WHERE guitar_item_id = gi.id AND valuation_type = 'ai'
          ORDER BY created_at DESC LIMIT 1
        ) ai_val ON true
        LEFT JOIN LATERAL (
          SELECT price FROM guitar_valuations
          WHERE guitar_item_id = gi.id AND valuation_type = 'user'
          ORDER BY created_at DESC LIMIT 1
        ) user_val ON true
        WHERE gi.user_id = $1 AND gi.archived_at IS NULL

        UNION ALL

        SELECT
          wi.id,
          wi.brand,
          wi.model,
          wi.year,
          wi.category,
          'watch'        AS collection_type,
          wi.dial_color  AS subtitle,
          wi.condition,
          wi.created_at,
          ai_val.price   AS latest_ai_price,
          user_val.price AS latest_user_price,
          (
            SELECT img.path FROM watch_images img
            WHERE img.watch_item_id = wi.id
            ORDER BY img.is_primary DESC, img.sort_order ASC, img.created_at ASC
            LIMIT 1
          ) AS primary_image_path
        FROM watch_items wi
        LEFT JOIN LATERAL (
          SELECT price FROM watch_valuations
          WHERE watch_item_id = wi.id AND valuation_type = 'ai'
          ORDER BY created_at DESC LIMIT 1
        ) ai_val ON true
        LEFT JOIN LATERAL (
          SELECT price FROM watch_valuations
          WHERE watch_item_id = wi.id AND valuation_type = 'user'
          ORDER BY created_at DESC LIMIT 1
        ) user_val ON true
        WHERE wi.user_id = $1 AND wi.archived_at IS NULL

        UNION ALL

        SELECT
          a.id,
          a.brand,
          a.model,
          a.year,
          a.category,
          'auto'         AS collection_type,
          a.color        AS subtitle,
          COALESCE(a.condition, 'Unknown') AS condition,
          a.created_at,
          ai_val.price   AS latest_ai_price,
          user_val.price AS latest_user_price,
          (
            SELECT img.path FROM auto_images img
            WHERE img.auto_id = a.id
            ORDER BY img.is_primary DESC, img.sort_order ASC, img.created_at ASC
            LIMIT 1
          ) AS primary_image_path
        FROM automobiles a
        LEFT JOIN LATERAL (
          SELECT price FROM auto_valuations
          WHERE auto_id = a.id AND valuation_type = 'ai'
          ORDER BY created_at DESC LIMIT 1
        ) ai_val ON true
        LEFT JOIN LATERAL (
          SELECT price FROM auto_valuations
          WHERE auto_id = a.id AND valuation_type = 'user'
          ORDER BY created_at DESC LIMIT 1
        ) user_val ON true
        WHERE a.user_id = $1 AND a.archived_at IS NULL

        UNION ALL

        SELECT
          i.id,
          COALESCE(i.brand, i.item_type, 'Unknown') AS brand,
          i.short_description AS model,
          i.year,
          i.category,
          'iod'          AS collection_type,
          i.item_type    AS subtitle,
          COALESCE(i.condition, 'Unknown') AS condition,
          i.created_at,
          ai_val.price   AS latest_ai_price,
          user_val.price AS latest_user_price,
          (
            SELECT img.path FROM iod_images img
            WHERE img.iod_id = i.id
            ORDER BY img.is_primary DESC, img.sort_order ASC, img.created_at ASC
            LIMIT 1
          ) AS primary_image_path
        FROM items_of_distinction i
        LEFT JOIN LATERAL (
          SELECT price FROM iod_valuations
          WHERE iod_id = i.id AND valuation_type = 'ai'
          ORDER BY created_at DESC LIMIT 1
        ) ai_val ON true
        LEFT JOIN LATERAL (
          SELECT price FROM iod_valuations
          WHERE iod_id = i.id AND valuation_type = 'user'
          ORDER BY created_at DESC LIMIT 1
        ) user_val ON true
        WHERE i.user_id = $1 AND i.archived_at IS NULL
      ) combined
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId]);
    const recent_item = recentRows[0] ?? null;

    // ── Activity: recent additions + valuations (all four collections) ──
    const activityRows = await query<{
      item_id: string;
      collection_type: string;
      event_type: string;
      event_date: string;
      title: string;
      subtitle: string;
      value: number | null;
    }>(`
      (
        SELECT
          gi.id                                          AS item_id,
          'guitar'                                       AS collection_type,
          'added'                                        AS event_type,
          gi.created_at                                  AS event_date,
          gi.brand || ' ' || gi.model                   AS title,
          'Added to collection · ' || gi.category       AS subtitle,
          gi.purchase_price                              AS value
        FROM guitar_items gi
        WHERE gi.user_id = $1 AND gi.archived_at IS NULL
        ORDER BY gi.created_at DESC
        LIMIT 8
      )
      UNION ALL
      (
        SELECT
          gi.id                                          AS item_id,
          'guitar'                                       AS collection_type,
          gv.valuation_type || '_valuation'             AS event_type,
          gv.created_at                                  AS event_date,
          gi.brand || ' ' || gi.model                   AS title,
          CASE gv.valuation_type
            WHEN 'ai'   THEN 'AI valuation recorded'
            WHEN 'user' THEN 'Manual valuation recorded'
          END                                            AS subtitle,
          gv.price                                       AS value
        FROM guitar_valuations gv
        JOIN guitar_items gi ON gi.id = gv.guitar_item_id
        WHERE gi.user_id = $1 AND gi.archived_at IS NULL
        ORDER BY gv.created_at DESC
        LIMIT 8
      )
      UNION ALL
      (
        SELECT
          wi.id                                          AS item_id,
          'watch'                                        AS collection_type,
          'added'                                        AS event_type,
          wi.created_at                                  AS event_date,
          wi.brand || ' ' || wi.model                   AS title,
          'Added to watches · ' || wi.category          AS subtitle,
          wi.purchase_price                              AS value
        FROM watch_items wi
        WHERE wi.user_id = $1 AND wi.archived_at IS NULL
        ORDER BY wi.created_at DESC
        LIMIT 8
      )
      UNION ALL
      (
        SELECT
          wi.id                                          AS item_id,
          'watch'                                        AS collection_type,
          wv.valuation_type || '_valuation'             AS event_type,
          wv.created_at                                  AS event_date,
          wi.brand || ' ' || wi.model                   AS title,
          CASE wv.valuation_type
            WHEN 'ai'   THEN 'AI valuation recorded'
            WHEN 'user' THEN 'Manual valuation recorded'
          END                                            AS subtitle,
          wv.price                                       AS value
        FROM watch_valuations wv
        JOIN watch_items wi ON wi.id = wv.watch_item_id
        WHERE wi.user_id = $1 AND wi.archived_at IS NULL
        ORDER BY wv.created_at DESC
        LIMIT 8
      )
      UNION ALL
      (
        SELECT
          a.id                                           AS item_id,
          'auto'                                         AS collection_type,
          'added'                                        AS event_type,
          a.created_at                                   AS event_date,
          COALESCE(a.brand || ' ' || a.model, a.model, 'Vehicle') AS title,
          'Added to automobiles · ' || a.category       AS subtitle,
          a.purchase_price                               AS value
        FROM automobiles a
        WHERE a.user_id = $1 AND a.archived_at IS NULL
        ORDER BY a.created_at DESC
        LIMIT 8
      )
      UNION ALL
      (
        SELECT
          a.id                                           AS item_id,
          'auto'                                         AS collection_type,
          av.valuation_type || '_valuation'             AS event_type,
          av.created_at                                  AS event_date,
          COALESCE(a.brand || ' ' || a.model, a.model, 'Vehicle') AS title,
          CASE av.valuation_type
            WHEN 'ai'   THEN 'AI valuation recorded'
            WHEN 'user' THEN 'Manual valuation recorded'
          END                                            AS subtitle,
          av.price                                       AS value
        FROM auto_valuations av
        JOIN automobiles a ON a.id = av.auto_id
        WHERE a.user_id = $1 AND a.archived_at IS NULL
        ORDER BY av.created_at DESC
        LIMIT 8
      )
      UNION ALL
      (
        SELECT
          i.id                                           AS item_id,
          'iod'                                          AS collection_type,
          'added'                                        AS event_type,
          i.created_at                                   AS event_date,
          i.short_description                            AS title,
          'Added to collectibles · ' || i.category AS subtitle,
          i.purchase_price                               AS value
        FROM items_of_distinction i
        WHERE i.user_id = $1 AND i.archived_at IS NULL
        ORDER BY i.created_at DESC
        LIMIT 8
      )
      UNION ALL
      (
        SELECT
          i.id                                           AS item_id,
          'iod'                                          AS collection_type,
          iv.valuation_type || '_valuation'             AS event_type,
          iv.created_at                                  AS event_date,
          i.short_description                            AS title,
          CASE iv.valuation_type
            WHEN 'ai'   THEN 'AI valuation recorded'
            WHEN 'user' THEN 'Manual valuation recorded'
          END                                            AS subtitle,
          iv.price                                       AS value
        FROM iod_valuations iv
        JOIN items_of_distinction i ON i.id = iv.iod_id
        WHERE i.user_id = $1 AND i.archived_at IS NULL
        ORDER BY iv.created_at DESC
        LIMIT 8
      )
      ORDER BY event_date DESC
      LIMIT 12
    `, [userId]);

    // ── Random showcase images (all four collections, scoped to user) ──
    const randomImageRows = await query<{ path: string }>(`
      SELECT path FROM (
        (SELECT gi_img.path FROM guitar_images gi_img
         JOIN guitar_items gi ON gi.id = gi_img.guitar_item_id
         WHERE gi.user_id = $1 AND gi.archived_at IS NULL ORDER BY RANDOM() LIMIT 3)
        UNION ALL
        (SELECT wi_img.path FROM watch_images wi_img
         JOIN watch_items wi ON wi.id = wi_img.watch_item_id
         WHERE wi.user_id = $1 AND wi.archived_at IS NULL ORDER BY RANDOM() LIMIT 3)
        UNION ALL
        (SELECT ai_img.path FROM auto_images ai_img
         JOIN automobiles a ON a.id = ai_img.auto_id
         WHERE a.user_id = $1 AND a.archived_at IS NULL ORDER BY RANDOM() LIMIT 3)
        UNION ALL
        (SELECT iod_img.path FROM iod_images iod_img
         JOIN items_of_distinction i ON i.id = iod_img.iod_id
         WHERE i.user_id = $1 AND i.archived_at IS NULL ORDER BY RANDOM() LIMIT 3)
      ) combined
      ORDER BY RANDOM()
      LIMIT 5
    `, [userId]);
    const random_images = randomImageRows.map(r => r.path);

    const combinedTotalValue =
      guitarTotals.total_value +
      Number(watchTotals.total_value) +
      Number(autoTotals.total_value) +
      Number(iodTotals.total_value);

    const combinedTotalItems =
      guitarTotals.total_items +
      Number(watchTotals.total_items) +
      Number(autoTotals.total_items) +
      Number(iodTotals.total_items);

    return NextResponse.json({
      portfolio: {
        total_value: combinedTotalValue,
        total_items: combinedTotalItems,
        valued_items:
          guitar_valued_items + watch_valued_items + auto_valued_items + iod_valued_items,
      },
      guitar_portfolio: {
        total_value: guitarTotals.total_value,
        total_items: guitarTotals.total_items,
        valued_items: guitar_valued_items,
      },
      watch_portfolio: {
        total_value: Number(watchTotals.total_value),
        total_items: Number(watchTotals.total_items),
        valued_items: watch_valued_items,
      },
      auto_portfolio: {
        total_value: Number(autoTotals.total_value),
        total_items: Number(autoTotals.total_items),
        valued_items: auto_valued_items,
      },
      iod_portfolio: {
        total_value: Number(iodTotals.total_value),
        total_items: Number(iodTotals.total_items),
        valued_items: iod_valued_items,
      },
      categories: categoryRows,
      recent_item,
      activity: activityRows,
      random_images,
    });
  } catch (error) {
    console.error("GET /api/dashboard error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
