  const common = (() => {
  const CLIENT_ID = 'fsm-ext-demo-uf4jra';
  const CLIENT_VERSION = '1.0.0';
  const PRICE_LIST_UDO_META_NAME = 'Cennik_part';

  let _shellSdk = null;
  function setShellSdk(shellSdk) {
    _shellSdk = shellSdk;
  }

  function getShellSdk() {
    if (!_shellSdk) {
      throw new Error("SHELL_SDK has not been set!");
    }
    return _shellSdk;
  }

  let _context = null;
  let _context_valid_until = null;
  function getContext() {
    const { SHELL_EVENTS } = FSMShell;

    if (_context && Date.now() < _context_valid_until) {
      return Promise.resolve(_context);
    }

    console.debug('Requesting context');
    return new Promise((rs) => {
      _shellSdk.emit(SHELL_EVENTS.Version1.REQUIRE_CONTEXT, {
        clientIdentifier: CLIENT_ID,
        auth: {
          response_type: 'token'
        },
      });

      _shellSdk.on(SHELL_EVENTS.Version1.REQUIRE_CONTEXT, (event) => {
        console.debug('Received context');
        _context = JSON.parse(event);
        _context_valid_until = Date.now() + _context.auth.expires_in * 1000 - 3000;
        rs(_context);
      });
    });
  }

  async function getHeaders() {
    const context = await common.getContext();
    return {
      'Accept': 'application/json',
      'Authorization': `Bearer ${context.auth.access_token}`,
      'Content-Type': 'application/json',
      'X-Client-ID': CLIENT_ID,
      'X-Client-Version': CLIENT_VERSION,
    };
  }

  async function getHeadersForOrgLevel() {
    const context = await common.getContext();
    return {
      /*'Accept': 'application/json',*/
      'Authorization': `Bearer ${context.auth.access_token}`,
     /* 'Content-Type': 'application/json',*/
      'X-Account-ID': context.accountId,
      'X-Company-ID': context.companyId,
      'X-Client-ID': CLIENT_ID,
      'X-Client-Version': CLIENT_VERSION,
    };
  }
  
  async function getSearchParams() {
    const context = await common.getContext();
    return {
      account: context.account,
      company: context.company,
    };
  }

  /**
   * @param {string} [udoMetaName]
   * @returns {Promise<{ id: string, udoMetaId: string, name: string, description: string }[]>}
   */
  async function fetchUdfMeta(udoMetaName) {
    const response = await fetch(
      'https://eu.coresuite.com/api/query/v1?' + new URLSearchParams({
        ...await common.getSearchParams(),
        dtos: 'UdfMeta.19;UdoMeta.9',
      }),
      {
        method: 'POST',
        headers: await common.getHeaders(),
        body: JSON.stringify({
          query: `
            SELECT
              udf_meta.id AS id,
              udf_meta.description AS description,
              udf_meta.name AS name,
              udo_meta.id AS udoMetaId
            FROM UdoMeta udo_meta
            JOIN UdfMeta udf_meta
              ON udf_meta.id IN udo_meta.udfMetas
            WHERE udo_meta.name = '${udoMetaName}'
          `,
        }),
      },
    );
  
    if (!response.ok) {
      throw new Error(`Failed to fetch UdfMeta, got status ${response.status}`);
    }
  
    return (await response.json()).data;
  }

  /**
   * @param {string[]} [fieldNames]
   * @returns {Promise<{ id: string, name: string, description: string }[]>}
   */
  async function fetchUdfMetaByFieldName(fieldNames) {
    const response = await fetch(
      'https://eu.coresuite.com/api/query/v1?' + new URLSearchParams({
        ...await common.getSearchParams(),
        dtos: 'UdfMeta.19',
      }),
      {
        method: 'POST',
        headers: await common.getHeaders(),
        body: JSON.stringify({
          query: `
            SELECT
              udf_meta.id AS id,
              udf_meta.description AS description,
              udf_meta.name AS name
            FROM UdfMeta udf_meta
            WHERE udf_meta.name IN ('${fieldNames.join('\',\'')}')
          `,
        }),
      },
    );
  
    if (!response.ok) {
      throw new Error(`Failed to fetch UdfMeta, got status ${response.status}`);
    }
  
    return (await response.json()).data;
  }

  /**
   * @param {string} [personId] Shows only business partner of this person if provided.
   * @param {string} [crowdType] Filter by crowdType.
   * @returns {Promise<{ id: string, name: string }[]>}
   */
  async function fetchBusinessPartners(crowdType, personId) {
    const response = await fetch(
      'https://eu.coresuite.com/api/query/v1?' + new URLSearchParams({
        ...await common.getSearchParams(),
        dtos: 'BusinessPartner.23;Person.24',
      }),
      {
        method: 'POST',
        headers: await common.getHeaders(),
        body: JSON.stringify({
          query: `
            SELECT
              bp.id as id,
              bp.name as name
            FROM BusinessPartner bp
            ${ personId ? `
              JOIN Person p
                ON bp.id = p.businessPartner
              WHERE p.id = '${personId}'
            ` : ''}
            ${ crowdType ? `
              ${personId ? 'AND' : 'WHERE'} bp.crowdType = '${crowdType}'
            ` : ''}
          `,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch BusinessPartners, got status ${response.status}`);
    }

    return (await response.json()).data;
  }

  async function fetchBusinessPartnerMap() {
    const arr = await fetchBusinessPartners();
    return new Map(arr.map(e => [e.name, e.id]));
  }

  const personCache = new Map();

  /**
   * @param {string} personId
   * @returns {Promise<{ id: string, crowdType: string, firstName: string, lastName: string }>}
   */
  async function fetchPerson(personId) {
    const cached = personCache.get(personId);
    if (cached) {
      return cached;
    }

    const response = await fetch(
      'https://eu.coresuite.com/api/query/v1?' + new URLSearchParams({
        ...await common.getSearchParams(),
        dtos: 'Person.24',
      }),
      {
        method: 'POST',
        headers: await common.getHeaders(),
        body: JSON.stringify({
          query: `
            SELECT
              p.id as id,
              p.crowdType as crowdType,
              p.firstName as firstName,
              p.lastName as lastName
            FROM Person p
            WHERE p.id = '${personId}'
          `,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch person, got status ${response.status}`);
    }

    const body = await response.json();
    const person = body.data[0];

    personCache.set(personId, person);

    return person;
  }

  let canAccessUdoMetaResult = null;

  async function canAccessUdoMeta() {
    if (canAccessUdoMetaResult != null) {
      return canAccessUdoMetaResult;
    }

    /**
     * 28.12.2022
     */

    const context = await common.getContext();

    const responseUnifiedPersonId = await fetch(
      'https://eu.coresuite.com/api/query/v1?' + new URLSearchParams({
        ...await common.getSearchParams(),
        dtos: 'UnifiedPerson.12',
      }),
      {
        method: 'POST',
        headers: await common.getHeaders(),
        body: JSON.stringify({
          query: `
            SELECT 
              up.id as unifiedPersonId 
            FROM UnifiedPerson up 
            WHERE up.userName = '${context.user}'
            LIMIT 1
          `,
        }),
      },
    );

    const respUniPerIdBody =  await responseUnifiedPersonId.json();
    const unifiedPersonId = (respUniPerIdBody.data && respUniPerIdBody.data.length > 0 ) ? respUniPerIdBody.data[0].unifiedPersonId : ''; 
    const unifiedPersonIdWithDashes = unifiedPersonId.substr(0,8) + '-' + unifiedPersonId.substr(8, 4) + '-' + unifiedPersonId.substr(12,4) + '-' + unifiedPersonId.substr(16,4) + '-' + unifiedPersonId.substr(20,12);  
    //https://eu.coresuite.com/cloud-org-level-service/api/v1/levels/allocations?unifiedPersonId=B78E5239-34A1-475E-AEF3-99329C68203A&includeSubLevels=false
    // unifiedPersonId=${unifiedPersonIdWithDashes}&includeSubLevels=false`
    let hhh = await common.getHeadersForOrgLevel();
    console.log('headers  no credentials: ', hhh)
 // `https://eu.coresuite.com/cloud-org-level-service/api/v1/levels/allocations?unifiedPersonId=${unifiedPersonIdWithDashes}&includeSubLevels=false`,
    const responseOrgLevel = await fetch(
      `https://eu.coresuite.com/cloud-org-level-service/api/v1/levels/allocations?unifiedPersonId=${unifiedPersonIdWithDashes}&includeSubLevels=false`,
      {
        method: 'GET',
       /* credentials: 'include', */
        /* referrerPolicy: 'origin-when-cross-origin', */
        headers: await common.getHeadersForOrgLevel(),
      },
    );
    console.log('getHeadersFor... with credentials');
    //let hhh = await common.getHeadersForOrgLevel(); mode: 'no-cors',
    console.log('headers: ', hhh);
    const orgLevelBody = await responseOrgLevel.json();
    console.log({orgLevelBody});







    const response = await fetch(
      'https://eu.coresuite.com/api/query/v1?' + new URLSearchParams({
        ...await common.getSearchParams(),
        dtos: 'UdoMeta.9',
        pageSize: 1,
        page: 1,
      }),
      {
        method: 'POST',
        headers: await common.getHeaders(),
        body: JSON.stringify({
          query: `
            SELECT
              um.id AS id
            FROM UdoMeta um
            WHERE um.name = '${PRICE_LIST_UDO_META_NAME}'
          `,
        }),
      },
    );

    if (!response.ok) {
      return (canAccessUdoMetaResult = false);
    }

    return (canAccessUdoMetaResult = true);
  }

  return {
    setShellSdk,
    getShellSdk,
    getContext,
    getHeaders,
    getHeadersForOrgLevel,
    getSearchParams,
    fetchUdfMeta,
    fetchUdfMetaByFieldName,
    fetchBusinessPartners,
    fetchBusinessPartnerMap,
    fetchPerson,
    canAccessUdoMeta,
  };
})();
