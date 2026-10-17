// Small synthetic datasets; tests never read data/imported/ or live services.
export function heritageFixture() {
  return [
    {
      Objektnummer: 123,
      Gemeinde: 'Schleswig, Stadt',
      Kreis: 'Kreis Schleswig-Flensburg',
      Bezeichnung: 'Example monument',
      Beschreibung: 'Synthetic description.',
      Kulturdenkmaltyp: 'Baudenkmal',
      'Adresse-Lage': 'Example street 1',
      Schutzumfang: ['Building'],
      Begründung: ['Historical'],
      FotoURL: 'https://example.com/photo.jpg',
    },
  ];
}

export function populationFixture() {
  return {
    years: [2040, 2018],
    data: {
      regions: [
        { ags: '01001000', name: 'Flensburg' },
        { ags: '01059075', name: 'Schleswig' },
      ],
      indicators: [
        {
          id: 336,
          name: 'Population',
          unit: 'people',
          regionYearValues: [
            [80_000, 75_000],
            [null, 25_000],
          ],
        },
      ],
      source: 'Synthetic source credit',
    },
  };
}

export function bathingWaterRow() {
  const row = Array<string>(29).fill('');
  Object.assign(row, {
    0: 'DESH_PR_0001',
    3: 'Example bathing water',
    4: 'Küstengewässer',
    18: '59',
    19: 'Schleswig-Flensburg',
    20: '075',
    21: 'Schleswig, Stadt',
    24: '9.55',
    25: '54.51',
    26: 'Synthetic description.',
  });
  return row;
}

export const chargingHeaders = [
  'Ladeeinrichtungs-ID',
  'Betreiber',
  'Status',
  'Art der Ladeeinrichtung',
  'Anzahl Ladepunkte',
  'Nennleistung Ladeeinrichtung [kW]',
  'Straße',
  'Hausnummer',
  'Adresszusatz',
  'Postleitzahl',
  'Ort',
  'Bundesland',
  'Breitengrad',
  'Längengrad',
];

export function chargingRow() {
  return [
    '1234',
    'Example operator',
    'In Betrieb',
    'Normalladeeinrichtung',
    '2',
    '22,5',
    'Example street',
    '1',
    '',
    '24837',
    'Schleswig',
    'Schleswig-Holstein',
    '54,51',
    '9,55',
  ];
}

export function csvRow(values: string[], delimiter = ';') {
  return values
    .map((value) =>
      /["\r\n]/.test(value) || value.includes(delimiter)
        ? '"' + value.replaceAll('"', '""') + '"'
        : value,
    )
    .join(delimiter);
}

export function chargingFixture(rows = [chargingRow()]) {
  return (
    '\uFEFFRegister;;;;\r\nLetzte Aktualisierung vom: 01.09.2026;;;;\r\n' +
    [chargingHeaders, ...rows].map((row) => csvRow(row)).join('\r\n')
  );
}

export function addressRow() {
  return [
    'N',
    'DESHPDHK00000001',
    'A',
    '01',
    'Schleswig-Holstein',
    '0',
    '',
    '59',
    'Schleswig-Flensburg',
    '075',
    'Schleswig',
    '0000',
    '',
    '00001',
    'Example street',
    '1',
    '(134)',
    '32',
    '534234.662',
    '6038770.162',
    '24837',
    '',
    '',
    '',
  ];
}
