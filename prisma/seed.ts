/* prisma/seed.ts */
import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("Falta DATABASE_URL. Revisa tu .env en la raíz del proyecto.");
}

// ✅ Driver Adapter Postgres (necesario en tu setup)
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type EstadoCliente = "Activo" | "Inactivo";

// ---------------------------------------------------------------------
// ✅ Pega aquí tu listado TAB-separado en este orden:
// nombre | rut | personaContacto | telefono | direccion | comuna | ciudad | email
// (si una columna no viene, déjala vacía con tabs)
// ---------------------------------------------------------------------
const CLIENTES_TSV = `
INVERSIONES OLIVARES HERMANOS SPA	77362989-7		965600975	PASAJE NORUEGA 1540	MAIPÚ		
CARLOS GONZALEZ PALMA							
COM. REAL CHILE SPA			972380862	SAN FCO. DE BORJA 1386 OF.5	EST.CENTRAL		
CRISTIAN TOBAR 							
CRISTIAN SOTO URZUA							
ADAVACIZ SPA	77413239-2			URIBE 636 OF 302 	ANTOFAGASTA		
JOSE ORLANDO MARTINEZ S.	11912386-0						
							
CONSTRUCTORA BEFCO 							
COMERCIAL HUECHURABA S.A.	76048063-0						
TITAN MAQUINARIA Y SERVICIOS LIMITADA	76266398-8						
CONSTRUCTORA GRUPO COLOSO LIMITADA	78862540-5						
SOCIEDAD COMERCIAL E INDUSTRIAL CANMETAL LIMITADA	76564440-2						
COM. FERRONLINE SPA	77304177-6			MORANDÉ 835	SANTIAGO		
JONATHAN TAPIA M.			962630476				
							
CONSTRUCTORA BRAVO E IZQUIERDO							
IGMA COQUIMBO	76.473.473-4						
CONSTRUCTORA COSAL							
CONSTRUCTORA ALTIUS SPA 	76449337-0						
ANVASELEC SPA	76989022-K			AHUMADA 254	SANTIAGO		
PRÁXEDES DEL ROSARIO PIZARRO LANDERO SPA							
FRANCISCO ZÚÑIGA	15958821-1			PIEDRA ROJA 1442B	LAS CONDES		
NARAVI SPA	77194054-4						
ROLANDO CARRASCO			958793901				
EBR SPA	76622538-1						
CONSTRUCTORA SALFA	93659000-4						
RONNY SOTO							
ANDES PERNOS 		LEONARDO FARIAS					
FERRESTORE SPA		DAVID ERICES	933964324	BALMACEDA 2950			
FERTEC		CARLOS VARAS					
LA CAMPANA		FELIPE GREZ					
HECTOR ROMAN Y OTRO LTDA.	78516260-9	ALEXIS SILVA	964116651				
Constructora Cubik SpA	77101795-9	Rodrigo Saez					
COMERCIAL SANTA FE SPA	76845761-1	DAVID DONOSO					
INSUFER S.A.	76141975-7	RICARDO GUERRA R.	94331863				
CHILE SEGURIDAD	76520271-K	LUIS CEBALLOS		DAGOBERTO GODOY 250	CERRILLOS		
CONSTRUCTORA LO BLANCO SPA	77652445-K	RENÉ RODRIGUEZ C.					
EURO METAL 	76681308-9	DELIA NIEVES					
TOTALMETAL		CLAUDIO GALLARDO 					
SOC.CONSTRUCTORA GLOBAL LTDA.		GUILLERMO GONZALEZ					
RVC GESTIÓN LTDA.	76599886-7	PATRICIO ALVAREZ MARTINEZ		AV.RAMON CRUZ MONTT 3354 D 	MACUL		
CONSTRUCTORA ABC		JUAN CARLOS GARCIA	971588681				
INGENIERÍA Y CONSTRUCCIÓN CRUZ DEL NORTE LTDA.	777226166-5	RAUL MILLACOY		CAMINIO EL ALBA PARC.41 LOTE 17	COLINA		
FERRETEC SPA		JUAN VEGA C.	986026697				
CONST. Y TRANSPORTES H.ROMAN	78516260-9	MAYKEL CIFUENTES BUSTOS	998327322				
IMP. Y COMER. VMA SPA		FELIPE MONSALVE	93272664				
BOZIC ING. Y CONSTRUCCIÓN LTDA.	776678805	ALEJANDRO FRÍTZ BUSTOS	979882271				
INGESEP LTDA.	76030744-0	JUAN CARLOS GUAJARDO ZURITA					
CONSTRUCTORA DAG SPA	77509815-5	CARLOS CORTEZ PIUTRIN	976672366				
CONSTRUCTORA C1		DILAN ROMAN BECERRA	930227161				
ROYALTY LINE		MARIO GARRIDO F.					
RVC INGENIERIA Y CONSTRUCCION S.A.	78223950-3						
ARA MARTINEZ INVERSIONES							
HORMIGONES ESMILDO PLAZA MUÑOZ EIRL	76233847-5	ESMILDO PLAZA		CALLE CONDELL 2026	ANTOFAGASTA		
CONSTRUCTORA DAG SPA	77509815-5	JUAN CARLOS RAMOS	988097862				
	77205523-4	JUAN PAULO BUSTOS	992602546	AV.DEL VALLE 714 PISO 3	SANTIAGO		
INFINITO, SOC.DE MONTAJE INDUSTRIAL LTDA.	76.938.950-4	BRYAN CORREA V.	966966153	LAS MARGARITAS 1884 HUERTOS FAMILIARES, SAN PEDRO DE LA PAZ			
RMD KWIFORM CHILE	96825530-4		227149800	LA ESTERA N°811, VALLE GRANDE 			
CONSTRUCTORA C3	76326545-5	CLAUDIA P.					
CONSTRUCTORA E  INMOBILIARIA MALPO.		DORIS BUSTOS E.	962742990				
CONSTRUCTORA FG	77205523-4	JUAN PAULO BUSTOS	992602546	AV.DEL VALLE 714 PISO 3	SANTIAGO		
SOC.PROFESIONAL CUARTA COSTA LTDA.	76503543-0	FABIÁN PHILP					
CONSTRUCCIÓN IND.CON MOLDAJE DE ALUMINIO SPA	76.926.609-7	FREDDI DIAZ					
CONSTRUCTORA BIO BIO 		GUSTAVO GALAZ P.	995460406				
CONSTRUCTORA BARRIOS		JUAN SOTO					
DOKA CHILE ENCOFRADOS LIMITADA		GUSTAVO NARVAEZ					
CONSTRUCTORA A2O		MIGUEL VALDÉS	989007306				
COMERCIAL ISACIAN SPA	77889774-1						
CONSTRUCTORA ACACIOS		MARIO PEÑA G.					
CONSTRUCTORA C1		JOSÉ BUSTAMANTE					
LUXOR LTDA.	76146720-4	MAURICIO MELANDRI I.					
CONSTRUCTORA C1		ARIEL LEIVA L.					
JOSÉ ANTONIO VILLAR RUIZ	7043283-8						
TASCO LTDA.	80.965.500-8	GABRIEL FARÍAS LOPEZ					
INM. E INV. SUDAMERICANA SPA	76452338-0			LUIS CARRERA 1263 OF. 302	VITACURA		
MINERA EL ABRA CALAMA		Miguel Troncoso Méndez	56975194122				
CONSTRUCTORA DAG SPA	77509815-5	GABRIELA CORREA					
INGESEP LTDA.	76030744-0	JUAN MOLINA V.					
IMPORTADORA Y DISTRIBUIDORA EMA CHILE SPA	77367337-3	MAYBELINE MEDINA 	952081013				
SOC.AGRICOLA MINERA LTDA.	87689800-4						
SAFRI DU CHILE S.A.	76078185-1						
STATUS SPA	77393761-4						
CONSTRUCTORA E.C.R 	77526800-K	LEONARDO BUSTAMANTE M.					
ARMAL INGENIERÍA Y CONSTRUCCIÓN LTDA.		MARCO BUGUEÑO I.					
AGLOSIM ING. Y PREFABRICADOS SPA	77468804-8	MARÍA TERESA ROBLEDO	962373658				
CONSTRUCTORA CASAA LTDA.	76.116.690-5	OLIVER PACHECO	944309674				
INVERSIONES CCO	77921101-0						
													
		
`.trim();

// -----------------------------
// Helpers
// -----------------------------
const asNull = (s?: string) => {
  const v = (s ?? "").trim();
  return v.length ? v : null;
};

function nullToUndefined<T extends Record<string, any>>(obj: T) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v === null ? undefined : v;
  }
  return out;
}

// -----------------------------
// Parse TSV -> clientesRaw
// -----------------------------
const clientesRaw = CLIENTES_TSV
  .split(/\r?\n/)
  .map((line) => line.trimEnd())
  .filter((line) => line.length > 0)
  .map((line) => {
    const cols = line.split("\t");

    // Asegura 8 columnas aunque vengan menos
    while (cols.length < 8) cols.push("");

    const [
      nombre,
      rut,
      personaContacto,
      telefono,
      direccion,
      comuna,
      ciudad,
      email,
    ] = cols;

    return {
      nombre: asNull(nombre) ?? "", // nombre debería venir siempre
      rut: asNull(rut),
      personaContacto: asNull(personaContacto),
      telefono: asNull(telefono),
      direccion: asNull(direccion),
      comuna: asNull(comuna),
      ciudad: asNull(ciudad),
      region: null as string | null, // 👈 si luego quieres agregar región, lo adaptamos
      email: asNull(email),
      estado: "Activo" as EstadoCliente,
    };
  });

// ✅ Tip final compatible con Prisma
const clientes: Prisma.ClienteCreateManyInput[] = (clientesRaw as any[]).map(
  (c) => nullToUndefined(c) as Prisma.ClienteCreateManyInput
);

async function main() {
  // (Opcional) mini resumen
  console.log(`Clientes a insertar: ${clientes.length}`);

  const res = await prisma.cliente.createMany({
    data: clientes,
    skipDuplicates: false, // duplicados permitidos según tu regla
  });

  console.log(`Seed OK. Insertados: ${res.count}`);
}

main()
  .catch((e) => {
    console.error("Seed falló:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
