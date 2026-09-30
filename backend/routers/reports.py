import io
import csv
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Response, Query
from database import get_sqlite_conn

router = APIRouter(prefix="/reports", tags=["Reports & Analytics"])


@router.get("/summary")
def get_reports_summary(
    range_type: str = "7days",  # "today", "yesterday", "7days", "30days", "this_month", "all", "custom"
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    conn = get_sqlite_conn()
    c = conn.cursor()

    now = datetime.now()
    if range_type == "today":
        start = now.strftime("%Y-%m-%d 00:00:00")
        end = now.strftime("%Y-%m-%d 23:59:59")
    elif range_type == "yesterday":
        yest = now - timedelta(days=1)
        start = yest.strftime("%Y-%m-%d 00:00:00")
        end = yest.strftime("%Y-%m-%d 23:59:59")
    elif range_type == "7days":
        start = (now - timedelta(days=6)).strftime("%Y-%m-%d 00:00:00")
        end = now.strftime("%Y-%m-%d 23:59:59")
    elif range_type == "30days":
        start = (now - timedelta(days=29)).strftime("%Y-%m-%d 00:00:00")
        end = now.strftime("%Y-%m-%d 23:59:59")
    elif range_type == "this_month":
        start = now.strftime("%Y-%m-01 00:00:00")
        end = now.strftime("%Y-%m-%d 23:59:59")
    elif range_type == "custom" and start_date and end_date:
        start = f"{start_date} 00:00:00"
        end = f"{end_date} 23:59:59"
    else:  # "all"
        start = "2020-01-01 00:00:00"
        end = "2099-12-31 23:59:59"

    # 1. Overall stats (exclude cancelled orders from revenue)
    c.execute("""
        SELECT 
            COUNT(*) as total_orders,
            SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END) as gross_revenue,
            SUM(CASE WHEN status != 'cancelled' THEN (subtotal - discount) ELSE 0 END) as net_revenue,
            SUM(CASE WHEN status != 'cancelled' THEN discount ELSE 0 END) as total_discount,
            SUM(CASE WHEN status != 'cancelled' THEN delivery_fee ELSE 0 END) as total_delivery_fee,
            SUM(CASE WHEN status IN ('delivered', 'completed') THEN 1 ELSE 0 END) as completed_orders,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
            SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) as paid_orders
        FROM orders
        WHERE created_at >= ? AND created_at <= ?
    """, (start, end))
    stats_row = c.fetchone()

    total_orders = stats_row["total_orders"] or 0
    gross_revenue = round(float(stats_row["gross_revenue"] or 0), 2)
    net_revenue = round(float(stats_row["net_revenue"] or 0), 2)
    total_discount = round(float(stats_row["total_discount"] or 0), 2)
    total_delivery_fee = round(float(stats_row["total_delivery_fee"] or 0), 2)
    completed_orders = stats_row["completed_orders"] or 0
    cancelled_orders = stats_row["cancelled_orders"] or 0
    paid_orders = stats_row["paid_orders"] or 0
    valid_orders = total_orders - cancelled_orders
    aov = round(gross_revenue / valid_orders, 2) if valid_orders > 0 else 0.0

    # 2. Payment Method Breakdown
    c.execute("""
        SELECT 
            payment_method,
            COUNT(*) as count,
            SUM(total) as revenue
        FROM orders
        WHERE created_at >= ? AND created_at <= ? AND status != 'cancelled'
        GROUP BY payment_method
    """, (start, end))
    pm_rows = c.fetchall()
    payment_methods = []
    for r in pm_rows:
        rev = round(float(r["revenue"] or 0), 2)
        pct = round((rev / gross_revenue) * 100, 1) if gross_revenue > 0 else 0.0
        payment_methods.append({
            "method": r["payment_method"] or "cash",
            "count": r["count"],
            "revenue": rev,
            "percentage": pct
        })

    # 3. Order Type Breakdown
    c.execute("""
        SELECT 
            order_type,
            COUNT(*) as count,
            SUM(total) as revenue
        FROM orders
        WHERE created_at >= ? AND created_at <= ? AND status != 'cancelled'
        GROUP BY order_type
    """, (start, end))
    ot_rows = c.fetchall()
    order_types = []
    for r in ot_rows:
        rev = round(float(r["revenue"] or 0), 2)
        pct = round((rev / gross_revenue) * 100, 1) if gross_revenue > 0 else 0.0
        order_types.append({
            "type": r["order_type"] or "delivery",
            "count": r["count"],
            "revenue": rev,
            "percentage": pct
        })

    # 4. Daily Sales Trends
    c.execute("""
        SELECT 
            SUBSTR(created_at, 1, 10) as date,
            COUNT(*) as orders_count,
            SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END) as daily_revenue
        FROM orders
        WHERE created_at >= ? AND created_at <= ?
        GROUP BY SUBSTR(created_at, 1, 10)
        ORDER BY date ASC
    """, (start, end))
    daily_rows = c.fetchall()
    daily_trends = [{
        "date": r["date"],
        "orders": r["orders_count"],
        "revenue": round(float(r["daily_revenue"] or 0), 2)
    } for r in daily_rows]

    # 5. Top 10 Selling Items
    c.execute("""
        SELECT 
            oi.menu_item_id,
            oi.menu_item_name,
            SUM(oi.quantity) as total_quantity,
            SUM(oi.quantity * oi.unit_price) as total_revenue
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.created_at >= ? AND o.created_at <= ? AND o.status != 'cancelled'
        GROUP BY oi.menu_item_id
        ORDER BY total_quantity DESC
        LIMIT 10
    """, (start, end))
    top_rows = c.fetchall()
    top_items = [{
        "menu_item_id": r["menu_item_id"],
        "name": r["menu_item_name"],
        "quantity_sold": r["total_quantity"],
        "revenue": round(float(r["total_revenue"] or 0), 2)
    } for r in top_rows]

    conn.close()

    return {
        "range_type": range_type,
        "start_date": start[:10],
        "end_date": end[:10],
        "kpis": {
            "gross_revenue": gross_revenue,
            "net_revenue": net_revenue,
            "total_orders": total_orders,
            "completed_orders": completed_orders,
            "cancelled_orders": cancelled_orders,
            "paid_orders": paid_orders,
            "average_order_value": aov,
            "total_discount": total_discount,
            "total_delivery_fee": total_delivery_fee
        },
        "payment_methods": payment_methods,
        "order_types": order_types,
        "daily_trends": daily_trends,
        "top_items": top_items
    }


@router.get("/export-csv")
def export_orders_csv(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    conn = get_sqlite_conn()
    c = conn.cursor()

    query = "SELECT * FROM orders WHERE 1=1"
    params = []
    if start_date:
        query += " AND created_at >= ?"
        params.append(f"{start_date} 00:00:00")
    if end_date:
        query += " AND created_at <= ?"
        params.append(f"{end_date} 23:59:59")

    query += " ORDER BY created_at DESC"
    c.execute(query, params)
    rows = c.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)

    # Headers
    writer.writerow([
        "Order Number", "Date", "Customer Name", "Phone", "Order Type",
        "Table Number", "Status", "Payment Status", "Payment Method",
        "Subtotal", "Delivery Fee", "Discount", "Total"
    ])

    for r in rows:
        writer.writerow([
            r["order_number"],
            r["created_at"],
            r["customer_name"],
            r["phone"],
            r["order_type"],
            r["table_number"] or "",
            r["status"],
            r["payment_status"],
            r["payment_method"],
            f"{float(r['subtotal'] or 0):.2f}",
            f"{float(r['delivery_fee'] or 0):.2f}",
            f"{float(r['discount'] or 0):.2f}",
            f"{float(r['total'] or 0):.2f}"
        ])

    csv_content = output.getvalue()
    filename = f"savory_orders_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
