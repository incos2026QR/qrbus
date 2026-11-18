#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

// LCD 16x2 con adaptador I2C: SDA=21, SCL=22, direccion tipica=0x27.
// Si la pantalla no muestra texto, prueba la direccion 0x3F.
LiquidCrystal_I2C lcd(0x27, 16, 2);

const int PIN_SDA = 21;
const int PIN_SCL = 22;
const int PIN_LED_OK = 18;
const int PIN_LED_FAIL = 19;
const int PIN_BUZZER = 23;
const char *DEVICE_NAME = "Trufi_Hardware_01";
const char *SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
const char *CHARACTERISTIC_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb";
const uint32_t PAGE_DURATION_MS = 2600;

struct FareItem {
  char category;
  uint8_t tickets;
  uint32_t amountCents;
};

struct Payment {
  char code[6];
  uint8_t tickets;
  uint32_t totalCents;
  uint8_t itemCount;
  FareItem items[5];
};

QueueHandle_t paymentQueue = nullptr;
Payment incomingPayment;
uint8_t receivedItems = 0;
bool receivingPayment = false;
Payment activePayment;
bool paymentActive = false;
uint32_t paymentStartedAt = 0;
uint8_t lastPage = 255;

const char *categoryName(char category) {
  switch (category) {
    case 'G': return "General";
    case 'P': return "Primaria";
    case 'S': return "Sec./Univ.";
    case 'A': return "Adulto mayor";
    case 'D': return "Discapacidad";
    default: return "Otro";
  }
}

bool isDigits(const String &value) {
  if (value.length() == 0) return false;
  for (size_t i = 0; i < value.length(); i++) {
    if (!isDigit(value[i])) return false;
  }
  return true;
}

bool parseUnsigned(const String &value, uint32_t maximum, uint32_t &result) {
  if (!isDigits(value)) return false;
  const unsigned long parsed = strtoul(value.c_str(), nullptr, 10);
  if (parsed > maximum) return false;
  result = static_cast<uint32_t>(parsed);
  return true;
}

uint8_t splitFrame(const String &frame, String *fields, uint8_t capacity) {
  uint8_t count = 0;
  int start = 0;
  while (true) {
    const int separator = frame.indexOf('|', start);
    if (count >= capacity) return capacity + 1;
    if (separator < 0) {
      fields[count++] = frame.substring(start);
      return count;
    }
    fields[count++] = frame.substring(start, separator);
    start = separator + 1;
  }
}

void reportInvalidFrame(const char *message) {
  Serial.print("Trama BLE ignorada: ");
  Serial.println(message);
  receivingPayment = false;
}

bool itemTotalsMatch(const Payment &payment) {
  uint16_t ticketSum = 0;
  uint32_t amountSum = 0;
  for (uint8_t i = 0; i < payment.itemCount; i++) {
    ticketSum += payment.items[i].tickets;
    amountSum += payment.items[i].amountCents;
  }
  return ticketSum == payment.tickets && amountSum == payment.totalCents;
}

void handleFrame(String frame) {
  frame.trim();
  if (frame == "E") {
    if (!receivingPayment || receivedItems != incomingPayment.itemCount ||
        !itemTotalsMatch(incomingPayment)) {
      reportInvalidFrame("transaccion incompleta o totales inconsistentes");
      return;
    }
    if (xQueueSend(paymentQueue, &incomingPayment, 0) != pdTRUE) {
      reportInvalidFrame("cola de pagos llena");
      return;
    }
    receivingPayment = false;
    Serial.print("Pago recibido: ");
    Serial.println(incomingPayment.code);
    return;
  }

  String fields[5];
  const uint8_t count = splitFrame(frame, fields, 5);
  if (count > 5) {
    reportInvalidFrame("demasiados campos");
    return;
  }

  if (count == 5 && fields[0] == "B") {
    uint32_t tickets, totalCents, itemCount;
    if (fields[1].length() != 5 || !isDigits(fields[1]) ||
        !parseUnsigned(fields[2], 10, tickets) || tickets == 0 ||
        !parseUnsigned(fields[3], 999999, totalCents) ||
        !parseUnsigned(fields[4], 5, itemCount) || itemCount == 0) {
      reportInvalidFrame("inicio de transaccion invalido");
      return;
    }
    memset(&incomingPayment, 0, sizeof(incomingPayment));
    fields[1].toCharArray(incomingPayment.code, sizeof(incomingPayment.code));
    incomingPayment.tickets = tickets;
    incomingPayment.totalCents = totalCents;
    incomingPayment.itemCount = itemCount;
    receivedItems = 0;
    receivingPayment = true;
    return;
  }

  if (count == 4 && fields[0] == "I") {
    uint32_t tickets, amountCents;
    const String category = fields[1];
    if (!receivingPayment || receivedItems >= incomingPayment.itemCount ||
        category.length() != 1 || String("GPSAD").indexOf(category[0]) < 0 ||
        !parseUnsigned(fields[2], 10, tickets) || tickets == 0 ||
        !parseUnsigned(fields[3], 999999, amountCents)) {
      reportInvalidFrame("detalle de pasaje invalido");
      return;
    }
    FareItem &item = incomingPayment.items[receivedItems++];
    item.category = category[0];
    item.tickets = tickets;
    item.amountCents = amountCents;
    return;
  }

  reportInvalidFrame("comando desconocido");
}

class PaymentCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    const uint8_t *data = characteristic->getData();
    const size_t length = characteristic->getLength();
    String frame;
    for (size_t i = 0; i < length; i++) frame += static_cast<char>(data[i]);
    handleFrame(frame);
  }
};

void formatMoney(uint32_t cents, char *buffer, size_t bufferSize) {
  snprintf(buffer, bufferSize, "%lu.%02lu",
           static_cast<unsigned long>(cents / 100),
           static_cast<unsigned long>(cents % 100));
}

void printLine(uint8_t row, const char *text) {
  lcd.setCursor(0, row);
  lcd.print("                ");
  lcd.setCursor(0, row);
  lcd.print(text);
}

void drawWaitingScreen() {
  printLine(0, "TRUFI ESPERANDO");
  printLine(1, "Pago via BLE");
}

void drawSummary(const Payment &payment) {
  char firstLine[17];
  char secondLine[17];
  char total[12];
  formatMoney(payment.totalCents, total, sizeof(total));
  snprintf(firstLine, sizeof(firstLine), "Cod:%s %u pas",
           payment.code, payment.tickets);
  snprintf(secondLine, sizeof(secondLine), "TOTAL Bs %s", total);
  printLine(0, firstLine);
  printLine(1, secondLine);
}

void drawDetails(const Payment &payment, uint8_t itemIndex) {
  const FareItem &item = payment.items[itemIndex];
  char firstLine[17];
  char secondLine[17];
  char amount[12];
  char total[12];
  formatMoney(item.amountCents, amount, sizeof(amount));
  formatMoney(payment.totalCents, total, sizeof(total));
  snprintf(firstLine, sizeof(firstLine), "%ux %s",
           item.tickets, categoryName(item.category));
  snprintf(secondLine, sizeof(secondLine), "Bs%s T%s", amount, total);
  printLine(0, firstLine);
  printLine(1, secondLine);
}

void startPayment(const Payment &payment) {
  activePayment = payment;
  paymentActive = true;
  paymentStartedAt = millis();
  lastPage = 255;
  digitalWrite(PIN_LED_OK, HIGH);
  digitalWrite(PIN_LED_FAIL, LOW);
  tone(PIN_BUZZER, 2000, 150);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED_OK, OUTPUT);
  pinMode(PIN_LED_FAIL, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_LED_OK, LOW);
  digitalWrite(PIN_LED_FAIL, LOW);
  digitalWrite(PIN_BUZZER, LOW);

  Wire.begin(PIN_SDA, PIN_SCL);
  lcd.init();
  lcd.backlight();
  drawWaitingScreen();

  paymentQueue = xQueueCreate(3, sizeof(Payment));
  if (paymentQueue == nullptr) {
    Serial.println("ERROR: no se pudo crear la cola de pagos");
    printLine(0, "ERROR: memoria");
    while (true) delay(1000);
  }

  BLEDevice::init(DEVICE_NAME);
  BLEServer *server = BLEDevice::createServer();
  BLEService *service = server->createService(SERVICE_UUID);
  BLECharacteristic *characteristic = service->createCharacteristic(
      CHARACTERISTIC_UUID,
      BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  characteristic->setCallbacks(new PaymentCallbacks());
  service->start();

  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->start();
  Serial.println("Esperando conexion BLE: Trufi_Hardware_01");
}

void loop() {
  Payment queuedPayment;
  if (xQueueReceive(paymentQueue, &queuedPayment, 0) == pdTRUE) {
    startPayment(queuedPayment);
  }

  if (!paymentActive) {
    delay(100);
    return;
  }

  const uint8_t totalPages = 1 + activePayment.itemCount;
  const uint32_t elapsed = millis() - paymentStartedAt;
  if (elapsed >= totalPages * PAGE_DURATION_MS) {
    paymentActive = false;
    digitalWrite(PIN_LED_OK, LOW);
    drawWaitingScreen();
    return;
  }

  const uint8_t page = elapsed / PAGE_DURATION_MS;
  if (page != lastPage) {
    lastPage = page;
    if (page == 0) {
      drawSummary(activePayment);
    } else {
      drawDetails(activePayment, page - 1);
    }
  }
  delay(20);
}
