# Catálogo de muebles (contrato)

Claves válidas para `FurnitureItem.catalog`. El visor debe implementar **todas**: si falta el modelo 3D, dibuja una caja con las medidas nominales y la etiqueta de la clave, para que nunca haya muebles invisibles.

Medidas nominales en metros: ancho (x local) × profundidad (z local) × alto. El "frente" es el lado desde donde se usa el mueble (el asiento de un sofá, la puerta de un placard, los pies de la cama).

| Clave | Ancho | Prof. | Alto | Notas |
|---|---|---|---|---|
| sofa_2 | 1.60 | 0.90 | 0.85 | |
| sofa_3 | 2.10 | 0.90 | 0.85 | |
| armchair | 0.85 | 0.85 | 0.85 | |
| coffee_table | 1.10 | 0.60 | 0.45 | |
| tv_unit | 1.80 | 0.45 | 0.55 | |
| rug | 2.00 | 1.40 | 0.01 | sin collider |
| table_dining_4 | 1.20 | 0.80 | 0.75 | |
| table_dining_6 | 1.80 | 0.90 | 0.75 | |
| chair | 0.45 | 0.50 | 0.90 | |
| bed_single | 0.90 | 2.00 | 0.55 | frente = pies |
| bed_double | 1.40 | 2.00 | 0.55 | frente = pies |
| bed_queen | 1.60 | 2.00 | 0.55 | frente = pies |
| nightstand | 0.45 | 0.40 | 0.55 | |
| wardrobe | 1.20 | 0.60 | 2.10 | |
| desk | 1.20 | 0.60 | 0.75 | |
| desk_chair | 0.60 | 0.60 | 1.00 | |
| shelf | 0.80 | 0.35 | 1.80 | |
| kitchen_counter | 0.60 | 0.60 | 0.90 | módulo; se repite en línea |
| kitchen_upper | 0.60 | 0.35 | 0.70 | colgante, base a 1.50 m |
| fridge | 0.70 | 0.70 | 1.80 | |
| stove | 0.60 | 0.60 | 0.90 | |
| sink_kitchen | 0.80 | 0.60 | 0.90 | |
| toilet | 0.40 | 0.70 | 0.80 | |
| sink_bath | 0.60 | 0.45 | 0.85 | |
| shower | 0.90 | 0.90 | 2.00 | mampara |
| bathtub | 1.70 | 0.75 | 0.55 | |
| washing_machine | 0.60 | 0.60 | 0.85 | |
| plant | 0.50 | 0.50 | 1.20 | |
| lamp_floor | 0.40 | 0.40 | 1.60 | |
| outdoor_table | 1.60 | 0.90 | 0.75 | |
| outdoor_chair | 0.55 | 0.55 | 0.85 | |
| lounger | 0.70 | 1.90 | 0.40 | |
| bbq | 1.20 | 0.60 | 1.00 | parrillero |
| sofa_4 | 3.00 | 0.95 | 0.85 | |
| bed_king | 1.80 | 2.00 | 0.55 | frente = pies |
| table_dining_8 | 2.40 | 1.00 | 0.75 | |
| kitchen_island | 2.10 | 0.65 | 0.90 | frente = lado de trabajo |
| stool | 0.40 | 0.40 | 0.65 | banqueta de isla o barra |
| sideboard | 1.60 | 0.50 | 0.85 | aparador / vitrina baja |
| tall_cabinet | 0.60 | 0.60 | 2.10 | columna de horno, micro o despensa |
| bidet | 0.40 | 0.55 | 0.40 | |
| bench | 1.20 | 0.45 | 0.45 | banco |

Agregar claves nuevas: se agregan acá primero (con medidas), después en el catálogo del visor. Nunca usar en un house.json una clave que no esté en esta tabla.
