from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from datetime import datetime


# ==========================================
# CATEGORIES
# ==========================================
class CategoryBase(BaseModel):
    name: str
    description: Optional[str] = ""
    sort_order: Optional[int] = 0

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None

class CategoryResponse(CategoryBase):
    id: str
    created_at: Optional[str] = None


# ==========================================
# MENU ITEMS
# ==========================================
class MenuItemBase(BaseModel):
    name: str
    description: Optional[str] = ""
    price: float
    category_id: str
    image_url: Optional[str] = None
    is_available: bool = True
    sort_order: Optional[int] = 0
    preparation_time: Optional[int] = 20
    is_featured: Optional[bool] = False
    is_popular: Optional[bool] = False

class MenuItemCreate(MenuItemBase):
    pass

class MenuItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    category_id: Optional[str] = None
    image_url: Optional[str] = None
    is_available: Optional[bool] = None
    sort_order: Optional[int] = None
    preparation_time: Optional[int] = None
    is_featured: Optional[bool] = None
    is_popular: Optional[bool] = None

class MenuItemResponse(MenuItemBase):
    id: str
    category_name: Optional[str] = None
    created_at: Optional[str] = None


# ==========================================
# RESTAURANT TABLES
# ==========================================
class TableBase(BaseModel):
    table_number: int
    name: Optional[str] = None
    capacity: Optional[int] = 4
    is_active: bool = True

class TableCreate(TableBase):
    pass

class TableUpdate(BaseModel):
    table_number: Optional[int] = None
    name: Optional[str] = None
    capacity: Optional[int] = None
    is_active: Optional[bool] = None

class TableResponse(TableBase):
    id: str
    created_at: Optional[str] = None


# ==========================================
# COUPONS
# ==========================================
class CouponBase(BaseModel):
    code: str
    description: Optional[str] = ""
    discount_type: Literal["percentage", "fixed"] = "percentage"
    discount_value: float
    min_order_amount: Optional[float] = 0.0
    max_usage: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: bool = True

class CouponCreate(CouponBase):
    pass

class CouponUpdate(BaseModel):
    code: Optional[str] = None
    description: Optional[str] = None
    discount_type: Optional[Literal["percentage", "fixed"]] = None
    discount_value: Optional[float] = None
    min_order_amount: Optional[float] = None
    max_usage: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: Optional[bool] = None

class CouponResponse(CouponBase):
    id: str
    current_usage: int = 0
    created_at: Optional[str] = None

class CouponValidateRequest(BaseModel):
    code: str
    subtotal: float

class CouponValidateResponse(BaseModel):
    valid: bool
    coupon: Optional[CouponResponse] = None
    discount: float = 0.0
    error: Optional[str] = None


# ==========================================
# RESTAURANT SETTINGS
# ==========================================
class SettingsBase(BaseModel):
    name: str = "Savory"
    tagline: str = "Fresh food, made to order"
    phone: str = "+1 (555) 234-5678"
    email: str = "hello@savoryrestaurant.com"
    address: str = "123 Gourmet Blvd, Suite 100"
    opening_time: str = "08:00"
    closing_time: str = "22:00"
    delivery_fee: float = 2.50
    min_delivery_order: float = 10.00
    tax_rate: float = 0.00
    currency: str = "USD"
    currency_symbol: str = "$"
    default_prep_time: int = 20
    is_order_acceptance_open: bool = True
    is_pickup_enabled: bool = True
    is_delivery_enabled: bool = True
    telegram_bot_token: Optional[str] = ""
    telegram_chat_id: Optional[str] = ""
    telegram_bot_username: Optional[str] = "@savoryfood_bot"
    telegram_notifications_enabled: bool = True
    notify_on_new_order: bool = True
    notify_on_payment: bool = True
    notify_on_status_change: bool = True
    notify_on_low_stock: bool = True

class SettingsUpdate(BaseModel):
    name: Optional[str] = None
    tagline: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    opening_time: Optional[str] = None
    closing_time: Optional[str] = None
    delivery_fee: Optional[float] = None
    min_delivery_order: Optional[float] = None
    tax_rate: Optional[float] = None
    currency: Optional[str] = None
    currency_symbol: Optional[str] = None
    default_prep_time: Optional[int] = None
    is_order_acceptance_open: Optional[bool] = None
    is_pickup_enabled: Optional[bool] = None
    is_delivery_enabled: Optional[bool] = None
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    telegram_bot_username: Optional[str] = None
    telegram_notifications_enabled: Optional[bool] = None
    notify_on_new_order: Optional[bool] = None
    notify_on_payment: Optional[bool] = None
    notify_on_status_change: Optional[bool] = None
    notify_on_low_stock: Optional[bool] = None

class SettingsResponse(SettingsBase):
    id: str
    updated_at: Optional[str] = None

class TelegramTestRequest(BaseModel):
    bot_token: Optional[str] = None
    chat_id: Optional[str] = None

class TelegramTestResponse(BaseModel):
    success: bool
    message: str
    bot_username: Optional[str] = None


# ==========================================
# ORDERS & ORDER ITEMS
# ==========================================
OrderStatus = Literal[
    "pending", "confirmed", "preparing", "ready",
    "out_for_delivery", "delivered", "completed", "cancelled"
]

PaymentStatus = Literal[
    "unpaid", "pending", "paid", "failed", "refunded", "cancelled"
]

PaymentMethod = Literal["cash", "khqr", "card", "online"]
OrderType = Literal["delivery", "pickup", "dine_in"]

class OrderItemPayload(BaseModel):
    menu_item_id: str
    quantity: int
    unit_price: float
    notes: Optional[str] = None
    name: Optional[str] = None

class OrderCreate(BaseModel):
    customer_id: Optional[str] = None
    customer_name: str
    phone: str
    address: Optional[str] = None
    order_type: OrderType = "delivery"
    table_number: Optional[int] = None
    notes: Optional[str] = None
    coupon_code: Optional[str] = None
    payment_method: PaymentMethod = "cash"
    items: List[OrderItemPayload]
    customer_lat: Optional[float] = None
    customer_lng: Optional[float] = None
    telegram_user_id: Optional[str] = None
    telegram_chat_id: Optional[str] = None

class OrderStatusUpdate(BaseModel):
    status: OrderStatus
    notes: Optional[str] = None

class PaymentStatusUpdate(BaseModel):
    payment_status: PaymentStatus

class OrderItemResponse(BaseModel):
    id: str
    order_id: str
    menu_item_id: str
    menu_item_name: Optional[str] = None
    quantity: int
    unit_price: float
    notes: Optional[str] = None

class OrderResponse(BaseModel):
    id: str
    order_number: str
    customer_id: Optional[str] = None
    customer_name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    order_type: Optional[OrderType] = None
    table_number: Optional[int] = None
    status: OrderStatus
    subtotal: float
    delivery_fee: float
    tax: float = 0.0
    discount: float = 0.0
    total: float
    notes: Optional[str] = None
    payment_status: PaymentStatus
    payment_method: PaymentMethod
    customer_lat: Optional[float] = None
    customer_lng: Optional[float] = None
    coupon_code: Optional[str] = None
    qr_string: Optional[str] = None
    deeplink: Optional[str] = None
    md5: Optional[str] = None
    telegram_user_id: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    items: List[OrderItemResponse] = []
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# ==========================================
# STAFF & PROFILES
# ==========================================
UserRole = Literal["admin", "manager", "staff", "customer"]

class ProfileBase(BaseModel):
    full_name: str
    role: UserRole = "customer"
    avatar_url: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    avatar_url: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class ProfileResponse(ProfileBase):
    id: str
    email: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# ==========================================
# KHQR PAYMENTS
# ==========================================
class KHQRCreateRequest(BaseModel):
    order_id: str
    amount: float
    currency: Literal["USD", "KHR"] = "USD"
    order_number: Optional[str] = None

class KHQRCreateResponse(BaseModel):
    qr_string: str
    md5: str
    deeplink: Optional[str] = None
    amount: float
    currency: str

class KHQRCheckRequest(BaseModel):
    order_id: str
    md5: Optional[str] = None

class KHQRCheckResponse(BaseModel):
    paid: bool
    order_status: str
    payment_status: str
    message: Optional[str] = None
