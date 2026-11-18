#include <U8g2lib.h>

// ST7920 en modo serial: PSB debe estar en LOW (normalmente a GND).
// El backlight de 5 V (360 mA)
// requiere una fuente adecuada; no lo alimentes desde un GPIO del ESP32.
// Pines del modulo: E/SCLK=14, R/W(SID)=13, RS/CS=27, RST=26.
U8G2_ST7920_128X64_F_SW_SPI u8g2(U8G2_R0, 14, 13, 27, 26);

const int PIN_LED_OK = 18;
const int PIN_LED_FAIL = 19;
const int PIN_BUZZER = 23;
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

Payment samples[] = {
    {"19277", 4, 1050, 4, {{'G', 1, 300}, {'S', 1, 200}, {'D', 1, 250}, {'A', 1, 300}}},
    {"31740", 1, 300, 1, {{'G', 1, 300}}},
    {"50826", 3, 700, 2, {{'G', 2, 600}, {'P', 1, 100}}},
};
const uint8_t SAMPLE_COUNT = sizeof(samples) / sizeof(samples[0]);

Payment activePayment;
bool paymentActive = false;
uint8_t sampleIndex = 0;
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

void formatMoney(uint32_t cents, char *buffer, size_t bufferSize) {
  snprintf(buffer, bufferSize, "Bs %lu.%02lu",
           static_cast<unsigned long>(cents / 100),
           static_cast<unsigned long>(cents % 100));
}

void drawWaitingScreen() {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_6x10_tf);
  u8g2.drawStr(15, 20, "TRUFI - SIMULACION");
  u8g2.drawHLine(8, 27, 112);
  u8g2.setFont(u8g2_font_7x14_tf);
  u8g2.drawStr(18, 45, "Esperando pago");
  u8g2.setFont(u8g2_font_5x8_tf);
  u8g2.drawStr(20, 60, "Se mostraran 3 ejemplos");
  u8g2.sendBuffer();
}

void drawSummary(const Payment &payment) {
  char countText[24];
  char totalText[20];
  snprintf(countText, sizeof(countText), "%u pasaje%s", payment.tickets,
           payment.tickets == 1 ? "" : "s");
  formatMoney(payment.totalCents, totalText, sizeof(totalText));

  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_6x10_tf);
  u8g2.drawStr(28, 10, "PAGO RECIBIDO");

  u8g2.setFont(u8g2_font_logisoso24_tn);
  const int codeWidth = u8g2.getStrWidth(payment.code);
  u8g2.drawStr((128 - codeWidth) / 2, 38, payment.code);

  u8g2.setFont(u8g2_font_6x10_tf);
  u8g2.drawStr(2, 51, countText);
  u8g2.drawHLine(2, 55, 124);
  u8g2.drawStr(2, 64, "TOTAL");
  const int totalWidth = u8g2.getStrWidth(totalText);
  u8g2.drawStr(126 - totalWidth, 64, totalText);
  u8g2.sendBuffer();
}

void drawDetails(const Payment &payment, uint8_t page, uint8_t pageCount) {
  char title[24];
  snprintf(title, sizeof(title), "DETALLE %u/%u", page, pageCount);

  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_6x10_tf);
  u8g2.drawStr(2, 10, title);
  u8g2.drawHLine(2, 14, 124);

  const uint8_t firstItem = (page - 1) * 3;
  for (uint8_t row = 0; row < 3 && firstItem + row < payment.itemCount; row++) {
    const FareItem &item = payment.items[firstItem + row];
    char label[32];
    char amount[20];
    snprintf(label, sizeof(label), "%ux %s", item.tickets, categoryName(item.category));
    formatMoney(item.amountCents, amount, sizeof(amount));
    const uint8_t baseline = 26 + row * 12;
    u8g2.drawStr(2, baseline, label);
    const int amountWidth = u8g2.getStrWidth(amount);
    u8g2.drawStr(126 - amountWidth, baseline, amount);
  }

  u8g2.drawHLine(2, 53, 124);
  char total[20];
  formatMoney(payment.totalCents, total, sizeof(total));
  u8g2.drawStr(2, 64, "TOTAL");
  const int totalWidth = u8g2.getStrWidth(total);
  u8g2.drawStr(126 - totalWidth, 64, total);
  u8g2.sendBuffer();
}

void signalSuccess() {
  digitalWrite(PIN_LED_OK, HIGH);
  digitalWrite(PIN_LED_FAIL, LOW);
  tone(PIN_BUZZER, 2000, 150);
}

void startPayment(const Payment &payment) {
  activePayment = payment;
  paymentActive = true;
  paymentStartedAt = millis();
  lastPage = 255;
  signalSuccess();
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED_OK, OUTPUT);
  pinMode(PIN_LED_FAIL, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_LED_OK, LOW);
  digitalWrite(PIN_LED_FAIL, LOW);
  digitalWrite(PIN_BUZZER, LOW);

  u8g2.begin();
  drawWaitingScreen();
  delay(800);
}

void loop() {
  if (!paymentActive) {
    startPayment(samples[sampleIndex]);
    sampleIndex = (sampleIndex + 1) % SAMPLE_COUNT;
  }

  const uint8_t detailPages = (activePayment.itemCount + 2) / 3;
  const uint8_t totalPages = 1 + detailPages;
  const uint32_t elapsed = millis() - paymentStartedAt;
  if (elapsed >= totalPages * PAGE_DURATION_MS) {
    paymentActive = false;
    digitalWrite(PIN_LED_OK, LOW);
    drawWaitingScreen();
    delay(700);
    return;
  }

  const uint8_t page = elapsed / PAGE_DURATION_MS;
  if (page != lastPage) {
    lastPage = page;
    if (page == 0) {
      drawSummary(activePayment);
    } else {
      drawDetails(activePayment, page, detailPages);
    }
  }
  delay(20);
}
