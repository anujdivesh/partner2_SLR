const BASE_URL = 'https://gemthreddshpc.spc.int/thredds/catalog/POP/Partner2/SLR';

export async function getCountries(): Promise<string[]> {
  try {
    const response = await fetch(`${BASE_URL}/catalog.xml`);
    const text = await response.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');
    const datasets = xml.querySelectorAll('dataset[name]');
    const countries: string[] = [];
    datasets.forEach(dataset => {
      const name = dataset.getAttribute('name');
      if (name && !name.includes('.')) { // Filter to country folders only
        countries.push(name);
      }
    });
    return countries;
  } catch (error) {
    console.error('Error fetching countries:', error);
    return [];
  }
}