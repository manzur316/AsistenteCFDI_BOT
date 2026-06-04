# CFDI 4.0 - Analisis c_ClaveProdServ

Fuentes oficiales usadas:
- Guia: `C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL/Anexo_20_Guia_de_llenado_CFDI .pdf`
- Catalogo maestro: `C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL/catCFDI_V_4_20260603.xls`
- Catalogo activo personal: `data/concepts.normalized.json`

Nota de alcance: estos documentos son conocimiento operativo para validacion y captura manual. No autorizan timbrado, PAC ni automatizacion fiscal final.

Total de claves oficiales leidas: 52513.
Claves indexadas por relevancia Emberhub/RESICO: 3543.

## Validacion contra catalogo activo

| Clave activa | Existe en maestro | Descripcion SAT | Usos |
| --- | --- | --- | --- |
| 26121606 | SI | Cable coaxial | PROD-CCTV-006:Producto |
| 26121607 | SI | Cable de fibra óptica | PROD-RED-007:Producto |
| 26121609 | SI | Cable de redes | PROD-RED-005:Producto |
| 39121004 | SI | Unidades de suministro de energía | PROD-CCTV-007:Producto |
| 39121011 | SI | Fuentes ininterrumpibles de potencia | PROD-RED-008:Producto |
| 39121446 | SI | Equipo conector de terminal de cable | PROD-RED-006:Producto |
| 43191500 | SI | Dispositivos de comunicación personal | PROD-AC-005:Producto |
| 43191600 | SI | Partes o accesorios de dispositivos de comunicación personal | PROD-AC-003:Producto |
| 43201800 | SI | Dispositivos de almacenamiento | PROD-CCTV-005:Producto, PROD-PC-004:Producto |
| 43202222 | SI | Cables de computador | PROD-RED-009:Producto |
| 43211500 | SI | Computadores | PROD-PC-001:Producto |
| 43211600 | SI | Accesorios de computador | PROD-PC-002:Producto, PROD-PC-005:Producto |
| 43211710 | SI | Dispositivos de identificación de radio frecuencia | PROD-AC-002:Producto |
| 43211902 | SI | Paneles o monitores de pantalla de cristal líquido lcd | PROD-PC-003:Producto |
| 43222600 | SI | Equipo de servicio de red | PROD-RED-004:Producto |
| 43222609 | SI | Enrutadores (routers) de red | PROD-RED-001:Producto |
| 43222612 | SI | Interruptores de red | PROD-RED-002:Producto |
| 43222640 | SI | Punto de acceso inalámbrico | PROD-RED-003:Producto |
| 45121500 | SI | Cámaras | PROD-CCTV-001:Producto |
| 45121600 | SI | Accesorios para cámaras | PROD-CCTV-004:Producto |
| 46171619 | SI | Sistemas de seguridad o de control de acceso | PROD-AC-001:Producto, PROD-AC-004:Producto, PROD-AC-006:Producto |
| 46171621 | SI | Grabadoras de video o audio de vigilancia | PROD-CCTV-002:Producto |
| 46171622 | SI | Sistema de televisión de circuito cerrado cctv | PROD-CCTV-003:Producto |
| 72101510 | SI | Mantenimiento o reparación del sistema de plomería | BLOCK-004:Servicio |
| 72111100 | SI | Servicios de construcción de unidades multifamiliares | BLOCK-005:Servicio |
| 72151604 | SI | Servicio de  instalación de teléfonos y equipos para teléfonos | SVC-AC-013:Servicio |
| 72151605 | SI | Servicio de cableado para video, datos y voz | SVC-RED-003:Servicio, SVC-RED-005:Servicio, SVC-RED-006:Servicio, SVC-RED-010:Servicio, MIX-003:Mixto |
| 72151701 | SI | Servicio de instalación de sistemas de control de acceso | SVC-AC-003:Servicio, SVC-AC-008:Servicio |
| 72151702 | SI | Servicio de instalación de sistemas de televisión de circuito cerrado | SVC-CCTV-002:Servicio |
| 72151704 | SI | Servicio de instalación y mantenimiento de sistemas instrumentados de seguridad | SVC-AC-005:Servicio, SVC-AC-006:Servicio, SVC-AC-007:Servicio, SVC-AC-012:Servicio, SVC-CCTV-004:Servicio, SVC-CCTV-005:Servicio, SVC-CCTV-007:Servicio |
| 81111500 | SI | Ingeniería de software o hardware | BLOCK-001:Servicio |
| 81111803 | SI | Mantenimiento o soporte de redes de área local (lan) | SVC-RED-001:Servicio, SVC-RED-002:Servicio, SVC-RED-004:Servicio, SVC-RED-007:Servicio, SVC-RED-008:Servicio, SVC-RED-009:Servicio |
| 81111809 | SI | Servicio de instalación de sistemas | SVC-AC-004:Servicio, SVC-CCTV-003:Servicio |
| 81111810 | SI | Servicios de codificación de software | BLOCK-002:Servicio |
| 81111811 | SI | Servicios de soporte técnico o de mesa de ayuda | SVC-AC-001:Servicio, SVC-AC-002:Servicio, SVC-AC-009:Servicio, SVC-AC-010:Servicio, SVC-AC-011:Servicio, SVC-AC-014:Servicio, SVC-CCTV-001:Servicio, SVC-CCTV-006:Servicio, SVC-CCTV-009:Servicio, SVC-CCTV-010:Servicio, SVC-PC-004:Servicio, SVC-PC-005:Servicio, SVC-PC-007:Servicio, SVC-PC-008:Servicio, SVC-PC-009:Servicio, SVC-PC-010:Servicio, MIX-001:Mixto, MIX-002:Mixto, MIX-004:Mixto, MIX-005:Mixto |
| 81111812 | SI | Servicio de mantenimiento o soporte del hardware del computador | SVC-CCTV-008:Servicio, SVC-PC-001:Servicio, SVC-PC-002:Servicio, SVC-PC-003:Servicio, SVC-PC-006:Servicio |
| 81112103 | SI | Servicios de diseño de sitios web www | BLOCK-003:Servicio |
| 82101800 | SI | Servicios de agencia de publicidad | BLOCK-007:Servicio |
| 84111500 | SI | Servicios contables | BLOCK-006:Servicio |
| 90101500 | SI | Establecimientos para comer y beber | BLOCK-008:Servicio |

## Familias operativas

### CCTV

| Clave | Descripcion | IVA | Complemento | En base activa |
| --- | --- | --- | --- | --- |
| 10111304 | Tazones o equipo para alimentación de mascotas | Opcional |  | NO |
| 15121505 | Aceite de transformador o aislador | Opcional |  | NO |
| 20101600 | Cribas y equipos de alimentación | Opcional |  | NO |
| 20111707 | Adaptadores de herramientas de perforación | Opcional |  | NO |
| 20121435 | Kit adaptador de fraguado | Opcional |  | NO |
| 20122106 | Adaptadores de pistola | Opcional |  | NO |
| 20122301 | Cabezas de adaptador de cable de recuperación | Opcional |  | NO |
| 20141011 | Adaptador de cabeza de tubería | Opcional |  | NO |
| 21101608 | Gabinete o cámara para crecimiento de plantas | Opcional |  | NO |
| 23111603 | Hidrotratador de alimentación catalítica | Opcional |  | NO |
| 23151821 | Adaptador de cartucho filtro | Opcional |  | NO |
| 23151822 | Adaptadores o conectores o accesorios para soportes de filtros farmacéuticos | Opcional |  | NO |
| 23153008 | Plantilla de cámara | Opcional |  | NO |
| 23153021 | Mordaza de alimentación de cinta | Opcional |  | NO |
| 23153024 | Mordaza de alimentación | Opcional |  | NO |
| 23153037 | Conjunto de rodillos de alimentación | Opcional |  | NO |
| 25131707 | Aeronave de reconocimiento o vigilancia | Opcional |  | NO |
| 25172500 | Neumáticos y cámaras de neumáticos | Opcional |  | NO |
| 25173704 | Adaptadores de silenciadores | Opcional |  | NO |
| 25191519 | Adaptador de remolcado de aviones | Opcional |  | NO |

### RED_COMUNICACION

| Clave | Descripcion | IVA | Complemento | En base activa |
| --- | --- | --- | --- | --- |
| 10202119 | Rosal vivo corvette o red corvette | Opcional |  | NO |
| 10202420 | Rosal vivo eurored | Opcional |  | NO |
| 10202423 | Rosal vivo first red | Opcional |  | NO |
| 10202436 | Rosal vivo lady in red | Opcional |  | NO |
| 10202450 | Rosal vivo red berlin | Opcional |  | NO |
| 10202451 | Rosal vivo red bull | Opcional |  | NO |
| 10202452 | Rosal vivo red calypso | Opcional |  | NO |
| 10202453 | Rosal vivo red diamond | Opcional |  | NO |
| 10202454 | Rosal vivo red fantasy | Opcional |  | NO |
| 10202455 | Rosal vivo red france | Opcional |  | NO |
| 10202456 | Rosal vivo red intuition | Opcional |  | NO |
| 10202457 | Rosal vivo red jewel | Opcional |  | NO |
| 10202458 | Rosal vivo red magic | Opcional |  | NO |
| 10202459 | Rosal vivo red one | Opcional |  | NO |
| 10202460 | Rosal vivo red paris | Opcional |  | NO |
| 10202461 | Rosal vivo red princess | Opcional |  | NO |
| 10202462 | Rosal vivo red sensation o colorad | Opcional |  | NO |
| 10202463 | Rosal vivo red unique | Opcional |  | NO |
| 10202469 | Rosal vivo royal red | Opcional |  | NO |
| 10202471 | Rosal vivo sexy red | Opcional |  | NO |

### COMPUTO

| Clave | Descripcion | IVA | Complemento | En base activa |
| --- | --- | --- | --- | --- |
| 10161528 | Carambolo | Opcional |  | NO |
| 10161905 | Ramas y tallos secos | Opcional |  | NO |
| 10161906 | Penachos de gramíneas secos | Opcional |  | NO |
| 10191701 | Trampas para control animal | Opcional |  | NO |
| 10191703 | Trampas para el control de insectos voladores | Opcional |  | NO |
| 10201709 | Rosal vivo caramel antike o caramel antique | Opcional |  | NO |
| 10202108 | Rosal vivo caramba | Opcional |  | NO |
| 10202109 | Rosal vivo caramella | Opcional |  | NO |
| 10202881 | Rosal vivo tiramisú spray | Opcional |  | NO |
| 10212602 | Calla viva ramillete albertville | Opcional |  | NO |
| 10212603 | Calla viva ramillete aranal | Opcional |  | NO |
| 10212604 | Calla viva ramillete black eyed beauty | Opcional |  | NO |
| 10212605 | Calla viva ramillete black star | Opcional |  | NO |
| 10212606 | Calla viva ramillete brisbane | Opcional |  | NO |
| 10212607 | Calla viva ramillete crystal blush | Opcional |  | NO |
| 10212608 | Calla viva ramillete crystal pink | Opcional |  | NO |
| 10212609 | Calla viva ramillete crystal white | Opcional |  | NO |
| 10212610 | Calla viva ramillete dark captain romanc | Opcional |  | NO |
| 10212611 | Calla viva ramillete dark mozart | Opcional |  | NO |
| 10212612 | Calla viva ramillete dark naomi | Opcional |  | NO |

### CONTROL_ACCESO

| Clave | Descripcion | IVA | Complemento | En base activa |
| --- | --- | --- | --- | --- |
| 10202111 | Rosal vivo cartagena | Opcional |  | NO |
| 10302111 | Rosal cortado fresco cartagena | Opcional |  | NO |
| 10402111 | Rosal cortado seco cartagena | Opcional |  | NO |
| 14111518 | Tarjetas de índice | Opcional |  | NO |
| 14111536 | Tarjetas de préstamo de bibliotecas | Opcional |  | NO |
| 14111541 | Papel lector de marcas ópticas | Opcional |  | NO |
| 14111604 | Tarjetas de presentación | Opcional |  | NO |
| 14111605 | Tarjetas postales, de saludo o de notas | Opcional |  | NO |
| 14111611 | Tarjetas de invitación o de anuncio | Opcional |  | NO |
| 14111815 | Tarjetas de identificación | Opcional |  | NO |
| 14111816 | Tarjetas de huellas digitales de solicitante | Opcional |  | NO |
| 20122204 | Colector del choke | Opcional |  | NO |
| 20122205 | Colector de desviación | Opcional |  | NO |
| 20122312 | Colectores de cable de recuperación | Opcional |  | NO |
| 20143000 | Vástagos de succión | Opcional |  | NO |
| 20143001 | Vástagos de succión de aleación de acero | Opcional |  | NO |
| 20143003 | Vástago continuo de succión | Opcional |  | NO |
| 20143004 | Pin de terminación roscada de vástago continuo de succión | Opcional |  | NO |
| 20143005 | Acople deslizante de vástago continuo de succión | Opcional |  | NO |
| 23153132 | Deflectores de polvo | Opcional |  | NO |

### ACCESO_VEHICULAR

| Clave | Descripcion | IVA | Complemento | En base activa |
| --- | --- | --- | --- | --- |
| 10212807 | Celosia viva pluma rosado claro | Opcional |  | NO |
| 10212808 | Celosia viva pluma anaranjado | Opcional |  | NO |
| 10212809 | Celosia viva pluma púrpura | Opcional |  | NO |
| 10212810 | Celosia viva pluma rojo | Opcional |  | NO |
| 10212811 | Celosia viva pluma amarillo | Opcional |  | NO |
| 10501803 | Eucalipto cortado fresco pluma | Opcional |  | NO |
| 10501902 | Helecho cortado fresco pluma | Opcional |  | NO |
| 10502107 | Pasto fresco cortado pluma | Opcional |  | NO |
| 10502902 | Pluma de acacia púrpura fresca cortada | Opcional |  | NO |
| 11131501 | Plumas | Opcional |  | NO |
| 20141704 | Plataformas flotantes de brazo de tensión de producción costa afuera | Opcional |  | NO |
| 20141705 | Plataformas flotantes de brazo de tensión de almacenamiento costa afuera | Opcional |  | NO |
| 22101713 | Brazo de retroexcavadora o secciones del brazo | Opcional |  | NO |
| 23152206 | Protección de barrera | Opcional |  | NO |
| 23153140 | Brazos articulados | Opcional |  | NO |
| 23153414 | Brazos articulados de movimiento giratorio | Opcional |  | NO |
| 23191003 | Mezcladora con doble brazo amasador | Opcional |  | NO |
| 23221100 | Equipo y maquinaria del departamento de matanza y desplumamiento | Opcional |  | NO |
| 23221102 | Máquina desplumadora de pollos | Opcional |  | NO |
| 23241807 | Máquina de taladro de brazo radial | Opcional |  | NO |

### SERVICIOS_TECNICOS

| Clave | Descripcion | IVA | Complemento | En base activa |
| --- | --- | --- | --- | --- |
| 10141611 | Soportes para correas | Opcional |  | NO |
| 15121523 | Fluidos para preparación de lentes | Opcional |  | NO |
| 15121804 | Preparación contra óxido | Opcional |  | NO |
| 15131600 | Instalación de combustible de fisión | Opcional |  | NO |
| 20101800 | Sistemas mecanizados de soporte en tierra | Opcional |  | NO |
| 20101805 | Repuestos o accesorios de sistema mecanizado de soporte en tierra | Opcional |  | NO |
| 20111710 | Kit de reparación de tapones y tuberías de perforación | Opcional |  | NO |
| 20121202 | Equipo de fractura a granel usando unidades de soporte | Opcional |  | NO |
| 20121206 | Equipo de transporte de fracturación usando unidades de soporte | Opcional |  | NO |
| 20121311 | Equipo que usa unidades de soporte para control de arena a granel | Opcional |  | NO |
| 20121314 | Equipo de transporte de arena usando unidades de soporte | Opcional |  | NO |
| 20121433 | Kit de reparación de culminación de hoyo revestido | Opcional |  | NO |
| 20121434 | Kit de reparación de manga deslizante | Opcional |  | NO |
| 20121444 | Kit de reparación del sistema de revestimiento | Opcional |  | NO |
| 20122514 | Estructuras de soporte de boca de pozo | Opcional |  | NO |
| 20123202 | Kit de reparación expandible | Opcional |  | NO |
| 21101500 | Maquinaria agrícola para preparación del suelo | Opcional |  | NO |
| 22101618 | Equipos de preparación de superficies de rodamiento o mecanismos para su colocación | Opcional |  | NO |
| 22101714 | Kits de reparación o piezas de apisonadora | Opcional |  | NO |
| 23151822 | Adaptadores o conectores o accesorios para soportes de filtros farmacéuticos | Opcional |  | NO |

### ELECTRONICO

| Clave | Descripcion | IVA | Complemento | En base activa |
| --- | --- | --- | --- | --- |
| 10502109 | Pasto fresco cortado fuente | Opcional |  | NO |
| 12142203 | Fuentes alfa | Opcional |  | NO |
| 12142204 | Fuentes beta | Opcional |  | NO |
| 12142205 | Fuentes de cobalto | Opcional |  | NO |
| 12142206 | Fuentes gamma | Opcional |  | NO |
| 12142207 | Fuentes radio – isótopo | Opcional |  | NO |
| 12142208 | Fuentes de calibración | Opcional |  | NO |
| 20111707 | Adaptadores de herramientas de perforación | Opcional |  | NO |
| 20121435 | Kit adaptador de fraguado | Opcional |  | NO |
| 20122106 | Adaptadores de pistola | Opcional |  | NO |
| 20122301 | Cabezas de adaptador de cable de recuperación | Opcional |  | NO |
| 20122509 | Fuentes de poder de tubería flexible | Opcional |  | NO |
| 20122609 | Fuentes de impulso sísmicos | Opcional |  | NO |
| 20122617 | Controladores de fuente sísmicos | Opcional |  | NO |
| 20141011 | Adaptador de cabeza de tubería | Opcional |  | NO |
| 22101501 | Cargadores frontales | Opcional |  | NO |
| 22101528 | Cargadores de ruedas | Opcional |  | NO |
| 22101529 | Cargadores sobre patines con dirección | Opcional |  | NO |
| 22101532 | Cargadores de orugas | Opcional |  | NO |
| 23151821 | Adaptador de cartucho filtro | Opcional |  | NO |

## Guardrails semanticos

- Fuente de poder para camara no debe caer en DVR/NVR/disco si el mensaje no menciona DVR/NVR/disco.
- Venta prioriza PRODUCTO; revision/configuracion/mantenimiento prioriza SERVICIO.
- Cambio/reemplazo/sustitucion prioriza servicio o mixto, no producto puro salvo venta explicita.
