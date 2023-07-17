import puppeteer from "puppeteer";
import fs from "fs";

const CAPK_URL = "https://www.eftlab.com/knowledge-base/list-of-ca-public-keys";
const MASTERCARD = "MasterCard";
const VISA = "VISA";
const TEST = "Test";
const LIVE = "Live";

/**
 * Obtiene las filas de la tabla de capks para el tipo especificado
 * @param {Page} page
 * @param {"MasterCard" | "VISA"} type
 * @returns {Promise<string[]>}
 */
const getRowCAPKForType = async (page, type) => {
  return await page.evaluate((type) => {
    const trElements = Array.from(document.querySelectorAll("tr"));
    const filteredRows = trElements.filter((row) => {
      const firstCell = row.querySelector("td:first-child");
      return firstCell && firstCell.textContent.includes(type);
    });
    return filteredRows.map((row) => row.innerHTML);
  }, type);
};

/**
 * Convierte las filas de la tabla de capks a un arreglo de objetos JSON
 * @param {string[]} rows
 */
const convertToJSON = (rows) => {
  const result = [];
  rows.forEach((row) => {
    const tdValues = row
      .match(/<td>(.*?)<\/td>/g)
      .map((td) => td.replace(/<\/?td>/g, ""));

    const keys = [
      "issuer", // No tag
      "exponent", // DF04 - padding 6
      "ridIndex", // 9F22 - padding 2
      "ridList", // 9F06
      "modulus", // DF02
      "keyLength", // No tag
      "sha", // DF03
      "keyType", // No tag - 1 = Live, 2 = Test
      "expires", // DF05
    ];

    const jsonResult = Object.fromEntries(
      keys.map((key, index) => [key, tdValues[index]])
    );

    result.push(jsonResult);
  });

  return result;
};

/**
 * Guarda el texto en un archivo
 * @param {string} text
 */
const saveTextFile = (text) => {
  fs.writeFile("capks.xml", text, (error) => {
    if (error) {
      console.error("Error al guardar el archivo:", error);
      return;
    }
    console.log("El archivo se ha guardado correctamente.");
  });
};

/**
 * Obtiene el string de los tags XML
 * @param {{issuer: string, exponent: string, ridIndex: string, ridList: string, modulus: string, keyLength: string, sha: string, keyType: string, expires: string}[]} jsonRows
 * @returns {string}
 */
const getXMLStrTags = (jsonRows) => {
  let result = "";
  jsonRows.forEach((row) => {
    if (row.keyType !== TEST && row.keyType !== LIVE) return;

    let keyType = "";

    if (row.keyType === TEST) keyType = "0";
    else if (row.keyType === LIVE) keyType = "1";

    //<!--${keyType}-->
    const xmlStr = `<capk>
    <9F06>${row.ridList}</9F06>
    <9F22>${row.ridIndex}</9F22>
    <DF02>${row.modulus}</DF02>
    <DF03>${row.sha}</DF03>
    <DF04>${row.exponent.padStart(6, "0")}</DF04>
    <DF05>20311222</DF05>
    <DF06>01</DF06>
    <DF07>01</DF07>
</capk>\n`;

    result += xmlStr;
  });

  return result;
};

/**
 * Obtiene los datos de los capks y los guarda en un archivo XML
 */
const fetchCAPKData = async () => {
  try {
    // Creamos la instancia del browser y navegamos a la URL
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.goto(CAPK_URL);

    // Obtenemos los datos de los capk desde las tablas
    const mcRows = await getRowCAPKForType(page, MASTERCARD);
    const visaRows = await getRowCAPKForType(page, VISA);

    // Convertimos los datos a JSON y luego a XML
    let result = `<!-- Updated on ${new Date().toJSON()} -->\n<!-- ${MASTERCARD} -->\n`;
    result += getXMLStrTags(convertToJSON(mcRows));

    result += `\n<!-- ${VISA} -->\n`;
    result += getXMLStrTags(convertToJSON(visaRows));

    // Guardamos el archivo
    saveTextFile(result);

    // Cerramos el browser
    await browser.close();
  } catch (error) {
    console.error("Error:", error);
  }
};

fetchCAPKData();
