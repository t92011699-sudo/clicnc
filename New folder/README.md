# Departments API - PHP Backend

RESTful API built with pure PHP + PostgreSQL, matching the Full Data Model.

## 📁 Structure

```
project-root/
├── config/Database.php          # PDO PostgreSQL connection
├── core/
│   ├── Router.php               # Simple routing engine
│   ├── Request.php              # JSON body parser
│   └── Response.php             # JSON response formatter
├── controllers/
│   ├── DepartmentController.php # Departments CRUD + Reorder
│   ├── DoctorTypeController.php # Enable/Disable doctor types
│   ├── FixedSlotController.php  # Fixed slots CRUD + Reorder
│   ├── CustomSlotController.php # Custom slots CRUD
│   └── SaveController.php       # Bulk save entire department
├── utils/ErrorHandler.php       # Global exception handler
├── .htaccess                    # URL rewriting
└── index.php                    # Entry point
```

## ⚙️ Setup

### 1. Database Setup
Run the SQL schema file in your PostgreSQL database. The schema includes:
- Tables: `departments`, `doctor_types`, `fixed_slots`, `custom_slots`
- Views: `departments_with_stats`
- Functions: `get_effective_slots()`
- RLS policies (can be adapted for PHP auth)
- Seed data for 5 departments

### 2. Configuration
Edit `config/Database.php`:
```php
private string $host = 'localhost';
private string $port = '5432';
private string $db_name = 'departments_db';
private string $username = 'postgres';
private string $password = 'your_password';
```

### 3. Web Server

**Apache:** Enable `mod_rewrite`. The `.htaccess` file handles routing.

**Nginx:** Add to your server block:
```nginx
location / {
    try_files $uri $uri/ /index.php?$query_string;
}
```

### 4. PHP Requirements
- PHP 8.1+ (for match expressions, typed properties)
- PDO PostgreSQL extension (`pdo_pgsql`)

## 🔌 API Endpoints

### Departments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/departments` | List all departments |
| GET | `/api/departments/{id}` | Get department details (expanded) |
| POST | `/api/departments` | Create department |
| PUT | `/api/departments/{id}` | Update name/icon |
| DELETE | `/api/departments/{id}` | Delete department |
| PATCH | `/api/departments/reorder` | Reorder departments |

### Doctor Types
| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/api/departments/{id}/doctor-types` | Enable/Disable types |

### Fixed Slots
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/departments/{id}/doctor-types/{type}/fixed-slots` | List fixed slots |
| POST | `/api/departments/{id}/doctor-types/{type}/fixed-slots` | Add fixed slot |
| PUT | `/api/departments/{id}/doctor-types/{type}/fixed-slots/{slot_id}` | Update slot |
| DELETE | `/api/departments/{id}/doctor-types/{type}/fixed-slots/{slot_id}` | Delete slot |
| PATCH | `/api/departments/{id}/doctor-types/{type}/fixed-slots/reorder` | Reorder slots |

### Custom Slots
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/departments/{id}/doctor-types/{type}/custom-slots?date=YYYY-MM-DD` | List custom slots |
| POST | `/api/departments/{id}/doctor-types/{type}/custom-slots` | Add custom slot |
| PUT | `/api/departments/{id}/doctor-types/{type}/custom-slots/{slot_id}` | Update slot |
| DELETE | `/api/departments/{id}/doctor-types/{type}/custom-slots/{slot_id}` | Delete slot |

### Bulk Save
| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/api/departments/{id}/save` | Save entire department with nested data |

## 📋 Example Requests

### Create Department
```bash
curl -X POST http://localhost/api/departments \
  -H "Content-Type: application/json" \
  -d '{
    "name": "قسم جديد",
    "icon_url": null,
    "doctor_types": [
      {"type": "male", "label": "دكتور", "enabled": true},
      {"type": "female", "label": "دكتورة", "enabled": false}
    ]
  }'
```

### Save Entire Department
```bash
curl -X PUT http://localhost/api/departments/1/save \
  -H "Content-Type: application/json" \
  -d '{
    "name": "العلاج الطبيعي",
    "doctor_types": [
      {
        "type": "male",
        "enabled": true,
        "fixed_slots": [
          {"id": 10, "capacity": 3, "from_time": "10:00", "to_time": "14:00"},
          {"id": null, "capacity": 2, "from_time": "16:00", "to_time": "18:00"}
        ],
        "custom_slots": [
          {"id": null, "date": "2026-07-10", "capacity": 2, "from_time": "11:00", "to_time": "13:00"}
        ]
      }
    ]
  }'
```

## 🔐 Authentication (Optional)
The current implementation has a placeholder for auth. To add JWT:
1. Add `Authorization` header parsing in `Request.php`
2. Implement `AuthMiddleware.php`
3. Protect write endpoints in `index.php`

## 🐛 Error Responses
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "وقت البداية لازم يكون أقل من وقت النهاية",
    "field": "to_time"
  }
}
```
