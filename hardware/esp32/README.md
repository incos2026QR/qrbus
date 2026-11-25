# Programa del ESP32

Hay cuatro sketches independientes. Abre y carga **uno a la vez**:

- `TrufiDisplaySimulacion`: presenta pagos de ejemplo en el ST7920, sin Bluetooth.
- `TrufiDisplayBluetooth`: recibe por BLE el pago de la webapp y lo presenta en el ST7920.
- `TrufiDisplay16x2Simulacion`: presenta los mismos pagos de ejemplo en el LCD 16x2, sin Bluetooth.
- `TrufiDisplay16x2Bluetooth`: la misma recepción BLE para el LCD 16x2 con adaptador I2C.

## Arduino IDE

1. Instala el soporte **esp32 by Espressif Systems** desde Boards Manager.
2. Instala la biblioteca **U8g2** para los sketches ST7920 y **LiquidCrystal_I2C** para los sketches del LCD 16x2.
3. En `Tools > Board`, selecciona `ESP32 Dev Module` (la placa de la foto parece un ESP32 DevKit; confirma la serigrafía/modelo para elegir la variante exacta).
4. Abre directamente el `.ino` del sketch deseado (cada archivo está dentro de una carpeta con el mismo nombre), selecciona el puerto COM y pulsa **Verify**. Conecta por USB y pulsa **Upload** para grabarlo; no hace falta copiar el código a otro archivo.
5. Para pagos reales, carga el sketch `TrufiDisplayBluetooth` o `TrufiDisplay16x2Bluetooth`, abre la webapp en un navegador compatible con Web Bluetooth y enlaza `Trufi_Hardware_01`.

El Bluetooth BLE y FreeRTOS vienen con el core ESP32 de Arduino; no instales una biblioteca BLE adicional. Cada sketch se compila por separado. La simulación y el modo BLE no se cargan simultáneamente.
El protocolo BLE distingue Secundaria (`S`) de Universitario (`U`); carga el sketch Bluetooth actualizado para recibir ambas categorías.

## ST7920 128x64 de la foto

La placa de la pantalla tiene interfaz paralela y expone `PSB`, `RS`, `R/W`, `E` y `RST`; no se ve un adaptador I2C. Para el modo serial usado por U8g2, conecta:

| ST7920 | ESP32 DevKit |
|---|---|
| GND | GND |
| VCC | 5V/VIN, según la especificación del módulo |
| PSB | GND |
| E | GPIO 14 |
| R/W | GPIO 13 |
| RS | GPIO 27 |
| RST | GPIO 26 |
| VO | Ajuste de contraste; consulta el módulo antes de conectarlo |
| BLA / BLK | Retroiluminación, respeta la polaridad y corriente indicada |

Deja `DB0`–`DB7` sin conectar en modo serial. Los GPIO que llevan señales al LCD son salidas de 3.3 V. La compatibilidad de esos niveles con el módulo alimentado a 5 V depende de su especificación eléctrica; si no reconoce las señales, hace falta adaptación de nivel. No conectes una salida de 5 V del LCD a un GPIO del ESP32. La retroiluminación indicada consume hasta 360 mA: no la alimentes desde un GPIO ni asumas que el USB puede suministrar esa corriente junto con el ESP32. Confirma la tensión, el consumo y la capacidad de la fuente antes de energizarla. La foto muestra el pin `PSB`, pero no la parte trasera ni el modelo exacto; conecta `PSB` a GND únicamente si confirmas que no está ya unido a VCC en el módulo. No conectes `VO` ni `VOUT` sin el esquema o las instrucciones de ese modelo, porque se usan para contraste y pueden requerir una conexión específica.

El sketch asigna GPIO 18 al LED verde, GPIO 19 al rojo y GPIO 23 al buzzer. Usa una resistencia en serie con cada LED; comparte GND con el ESP32.

## LCD 16x2 con adaptador I2C

El sketch usa SDA GPIO 21, SCL GPIO 22 y la dirección I2C `0x27` (prueba `0x3F` si tu adaptador tiene otra dirección). Conecta VCC, GND, SDA y SCL según el módulo. Si el adaptador I2C alimentado a 5 V sube SDA/SCL a 5 V, no conectes esas señales directamente al ESP32: verifica si el adaptador ya limita los niveles o utiliza adaptación adecuada.

En 16x2 se muestra primero el código y el total; luego se alternan los detalles por categoría. La pantalla ST7920 muestra el resumen y hasta tres categorías por página. Para probar el LCD 16x2 sin enlazar la webapp, carga `TrufiDisplay16x2Simulacion`.
