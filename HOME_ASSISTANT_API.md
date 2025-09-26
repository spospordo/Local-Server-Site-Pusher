# Home Assistant API Integration

This document explains how to use the Local Server Site Pusher with Home Assistant to control and read espresso data using REST commands.

## API Endpoints

### GET /api/espresso
Retrieve current espresso data.

**Response Format:**
```json
{
  "success": true,
  "data": {
    "weight1": "18g",
    "grind1": ".8",
    "tempIn1": "90",
    "soak1": "yes",
    "notes1": "Updated from Home Assistant test",
    "time1": "32s",
    "weightOut1": "40g",
    "weight2": "17g",
    "grind2": ".9",
    "tempIn2": "88",
    "soak2": "Yes",
    "notes2": "Bright and fruity",
    "time2": "25s",
    "weightOut2": "40g",
    "weight3": "14g",
    "grind3": "2.75",
    "tempIn3": "90",
    "soak3": "Yes",
    "notes3": "Balanced, rich, bitter",
    "time3": "32s",
    "weightOut3": "40g",
    "beanName1": "Server Test Bean",
    "roastDate1": "Jan 2025",
    "beanName2": "Ethiopian Delight",
    "roastDate2": "Jan 2025",
    "beanName3": "Sample Bean 3",
    "roastDate3": "Jan 2025"
  },
  "timestamp": "2025-09-26T23:50:13.052Z"
}
```

### POST /api/espresso
Update espresso data. You can update any subset of the available fields.

**Request Format:**
```json
{
  "weight1": "18g",
  "notes1": "Updated from Home Assistant",
  "tempIn1": "92"
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "Espresso data updated successfully",
  "htmlGenerated": false,
  "outputPath": null,
  "timestamp": "2025-09-26T23:50:21.160Z"
}
```

## Home Assistant Configuration

### REST Commands

Add these to your Home Assistant `configuration.yaml` file:

```yaml
rest_command:
  # Update espresso data
  update_espresso:
    url: "http://YOUR_SERVER_IP:3000/api/espresso"
    method: POST
    headers:
      Content-Type: "application/json"
    payload: >
      {
        "weight1": "{{ states('input_text.espresso_weight1') }}",
        "grind1": "{{ states('input_text.espresso_grind1') }}",
        "tempIn1": "{{ states('input_text.espresso_temp1') }}",
        "notes1": "{{ states('input_text.espresso_notes1') }}",
        "beanName1": "{{ states('input_text.espresso_bean1') }}"
      }
  
  # Update individual field examples
  update_espresso_weight1:
    url: "http://YOUR_SERVER_IP:3000/api/espresso"
    method: POST
    headers:
      Content-Type: "application/json"
    payload: >
      {
        "weight1": "{{ weight1 }}"
      }
      
  update_espresso_notes:
    url: "http://YOUR_SERVER_IP:3000/api/espresso"
    method: POST
    headers:
      Content-Type: "application/json"
    payload: >
      {
        "notes1": "{{ notes }}"
      }
```

### REST Sensors

To read espresso data in Home Assistant:

```yaml
sensor:
  - platform: rest
    name: "Espresso Data"
    resource: "http://YOUR_SERVER_IP:3000/api/espresso"
    method: GET
    headers:
      Content-Type: "application/json"
    json_attributes:
      - success
      - data
      - timestamp
    value_template: "{{ value_json.success }}"
    scan_interval: 30
    
  # Individual field sensors
  - platform: rest
    name: "Espresso Weight 1"
    resource: "http://YOUR_SERVER_IP:3000/api/espresso"
    method: GET
    value_template: "{{ value_json.data.weight1 }}"
    scan_interval: 30
    
  - platform: rest
    name: "Espresso Notes 1"
    resource: "http://YOUR_SERVER_IP:3000/api/espresso"
    method: GET
    value_template: "{{ value_json.data.notes1 }}"
    scan_interval: 30
```

### Input Text Helpers

Create input helpers for easy espresso data entry:

```yaml
input_text:
  espresso_weight1:
    name: "Shot 1 Weight"
    initial: "18g"
    max: 10
    
  espresso_grind1:
    name: "Shot 1 Grind"
    initial: ".8"
    max: 10
    
  espresso_temp1:
    name: "Shot 1 Temperature"
    initial: "90"
    max: 10
    
  espresso_notes1:
    name: "Shot 1 Notes"
    initial: "Enter notes here"
    max: 100
    
  espresso_bean1:
    name: "Shot 1 Bean Name"
    initial: "Bean Name"
    max: 50
```

### Automation Examples

```yaml
automation:
  # Update espresso data when inputs change
  - alias: "Update Espresso Data"
    trigger:
      - platform: state
        entity_id:
          - input_text.espresso_weight1
          - input_text.espresso_grind1
          - input_text.espresso_temp1
          - input_text.espresso_notes1
          - input_text.espresso_bean1
    action:
      - service: rest_command.update_espresso
        
  # Quick update with specific values
  - alias: "Set Morning Espresso"
    trigger:
      - platform: time
        at: "08:00:00"
    action:
      - service: rest_command.update_espresso_weight1
        data:
          weight1: "18g"
      - service: rest_command.update_espresso_notes
        data:
          notes: "Morning brew - {{ now().strftime('%Y-%m-%d') }}"
```

## Available Data Fields

The espresso data includes three shots with the following fields for each:

**Shot 1:** weight1, grind1, tempIn1, soak1, notes1, time1, weightOut1, beanName1, roastDate1
**Shot 2:** weight2, grind2, tempIn2, soak2, notes2, time2, weightOut2, beanName2, roastDate2  
**Shot 3:** weight3, grind3, tempIn3, soak3, notes3, time3, weightOut3, beanName3, roastDate3

## Testing Your Configuration

You can test your endpoints using curl:

```bash
# Get current espresso data
curl -X GET http://YOUR_SERVER_IP:3000/api/espresso

# Update espresso data
curl -X POST http://YOUR_SERVER_IP:3000/api/espresso \
  -H "Content-Type: application/json" \
  -d '{"weight1": "18g", "notes1": "Test from command line"}'
```

Replace `YOUR_SERVER_IP` with your Local Server Site Pusher IP address (e.g., `192.168.1.100`).

## Error Handling

The API returns appropriate HTTP status codes:
- 200: Success
- 400: Bad request (invalid JSON format)
- 500: Server error

All responses include a `success` boolean field and a `timestamp` for tracking updates.