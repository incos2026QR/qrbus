#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// LCD 16x2 con adaptador I2C: SDA=21, SCL=22, direccion tipica=0x27.
// Si no aparece texto, prueba la direccion 0x3F.
LiquidCrystal_I2C lcd(0x27, 16, 2);

const int PIN_SDA = 21;
const int PIN_SCL = 22;
const int PIN_LED_OK = 18;
const int PIN_LED_FAIL = 19;
const int PIN_BUZZER = 23;
const uint32_t PAGE_DURATION_MS = 2200;
const uint32_t BETWEEN_PAYMENTS_MS = 1000;

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

Payment samples[] = {
    {"19277", 4, 1050, 4, {{'G', 1, 300}, {'S', 1, 200}, {'D', 1, 250}, {'A', 1, 300}}},
    {"31740", 1, 300, 1, {{'G', 1, 300}}},
    {"50826", 3, 700, 2, {{'G', 2, 600}, {'P', 1, 100}}},
};
const uint8_t SAMPLE_COUNT = sizeof(samples) / sizeof(samples[0]);

uint8_t sampleIndex = 0;
uint8_t lastPage = 255;
uint32_t paymentStartedAt = 0;
uint32_t waitingStartedAt = 0;
bool paymentActive = false;
Payment activePayment;

const char *categoryName(char category) {
  switch (category) {
    case 'G': return "General";
    case 'P': return "Primaria";
    case 'S': return "Sec/Univ";
    case 'A': return "Adulto mayor";
    case 'D': return "Discapacidad";
    default: return "Otro";
  }
}

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
  printLine(0, "TRUFI SIMULACION");
  printLine(1, "Proximo pago...");
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
  waitingStartedAt = millis();
}

void loop() {
  if (!paymentActive) {
    if (millis() - waitingStartedAt < BETWEEN_PAYMENTS_MS) {
      delay(20);
      return;
    }
    startPayment(samples[sampleIndex]);
    sampleIndex = (sampleIndex + 1) % SAMPLE_COUNT;
  }

  const Payment &payment = activePayment;
  const uint32_t elapsed = millis() - paymentStartedAt;
  const uint32_t paymentDuration = (1 + payment.itemCount) * PAGE_DURATION_MS;
  if (elapsed >= paymentDuration) {
    paymentActive = false;
    digitalWrite(PIN_LED_OK, LOW);
    drawWaitingScreen();
    waitingStartedAt = millis();
    return;
  }

  const uint8_t page = elapsed / PAGE_DURATION_MS;
  if (page != lastPage) {
    lastPage = page;
    if (page == 0) {
      drawSummary(payment);
    } else {
      drawDetails(payment, page - 1);
    }
  }
  delay(20);
}
