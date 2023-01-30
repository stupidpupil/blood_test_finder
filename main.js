var products = [];
var providers = [];
var biomarkers;

function lp_variables_for_biomarkers(chosen_biomarkers, options){
  var variables = []

  products.forEach(function(prod,i){
    var new_var = {}

    new_var.imagined_cost = prod.price_pence
    new_var.imagined_cost = new_var.imagined_cost + (prod.sampling_procedure == "venous" ? options.venous_penalty_pence : 0)


    if(options.require_venous == true){
      new_var.wrong_sampling_procedure = (prod.sampling_procedure == "venous" ? 0 : 1)
    }else{
      new_var.wrong_sampling_procedure = 0
    }

    if(options.forbidden_product_urls.includes(prod.url)){
      new_var.forbidden_url = 1
    }else{
      new_var.forbidden_url = 0
    }

    if(options.forbidden_provider_urls.includes(prod.provider_url)){
      new_var.forbidden_provider_url = 1
    }else{
      new_var.forbidden_provider_url = 0
    }

    chosen_biomarkers.forEach(b => new_var[b] = (prod.biomarkers.includes(b) ? 1 : 0))

    variables[i] = new_var
  })

  return(variables)
}

function lp_constraints_for_biomarkers(chosen_biomarkers, options){

  var constraints = {}

  chosen_biomarkers.forEach(b => constraints[b] = {"min": 1})

  constraints.wrong_sampling_procedure = {"max": 0}
  constraints.forbidden_url = {"max": 0}
  constraints.forbidden_provider_url = {"max": 0}
  


  return(constraints)
}

lp_model_for_biomarkers = function(chosen_biomarkers, options){

  defaults = {
    every_test_penalty_pence: 0,
    venous_penalty_pence: 0, /* This is *in addition* to venous_cost_pence */
    turnaround_day_penalty_pence: 0, /* Note that this accumulates for multiple tests, so doesn't work quite as you'd hope */
    require_venous: false,
    forbidden_product_urls: [],
    forbidden_provider_urls: []
  }

  if(options){
    options = {...defaults, ...options}
  }else{
    options = defaults
  }

  var model = {
    optimize: "imagined_cost",
    opType: "min",
    constraints: lp_constraints_for_biomarkers(chosen_biomarkers, options),
    variables: lp_variables_for_biomarkers(chosen_biomarkers, options)
  };

  model.ints = {}
  Object.keys(model.variables).forEach( prod => model.ints[prod] = 1)

  return(model)
}

format_price_pence = function(price_pence){
  var ret = price_pence.toString()

  ret = "£" + ret.substring(0, ret.length-2).padStart(1,"0") + "." + ret.substring(ret.length-2, ret.length).padStart(2,"0")

  return(ret)
}


html_span_for_biomarker = function(biomarker){
  return("<span class='biomarker'>" + biomarker.displayname + "</span>")
}

biomarker_for_biomarker_handle = function(biomarker_handle){
  var biomarker = biomarkers.find(biom => biom.sctid == biomarker_handle)

  if(!biomarker){
    biomarker = {
      sctid: biomarker_handle,
      displayname: biomarker_handle,
    }

  }


  return(biomarker)
}

html_spans_for_biomarker_handles = function(biomarker_handles){
  var rel_biomarkers = biomarker_handles.map(biomarker_for_biomarker_handle)

  return(rel_biomarkers.map(html_span_for_biomarker).join(" "))
}

html_for_product_handle = function(product_handle){

  var product = products[product_handle]
  var provider = providers.find(prov => prov.url == product.provider_url)

  var ret = "<tr><td><a target='_blank' rel='noreferrer nofollow noopener external' referrerpolicy='no-referrer' " + 
    "href='" + product.url + "'><i>" + product.name + "</i> by " + provider.name + "</a></td><td>" + format_price_pence(product.price_pence) + "</td></tr>"

  return(ret)
}

html_for_result = function(result){

  var suggested_products = result.suggested_test_handles.map(i => products[i])

  var total_cost = suggested_products.map(prod => prod.price_pence).reduce((a,b) => a+b, 0)

   return(`<div class="result"><table class="suggested_tests">
      <thead>
        <tr>
          <th>Test</th>
          <th>Cost</th>
        </tr>
      </thead>

      <tbody>` + 
        result.suggested_test_handles.map(h => html_for_product_handle(h)).join("\n")
      + "<tr class='total-row'><td>Total</td><td>"+ format_price_pence(total_cost) + "</td></tr>" +
      `
      </tbody>

    </table>` +
    (result.additional_biomarkers.length ? `<p class='additional-biomarkers'>Also has: ` + html_spans_for_biomarker_handles(result.additional_biomarkers) + "</p>" : "") + 
    (result.missing_biomarkers.length ? `<p class='missing-biomarkers'><em>Doesn't</em> have: ` + html_spans_for_biomarker_handles(result.missing_biomarkers) + "</p>" : "") + 
    "</div>")
}




resolve = function(){

  if(products.length == 0){
    return
  }

  if(!biomarkers){
    return
  }

  var chosen_biomarkers = $("#biomarkers-select").val().sort()
  var require_venous = $("#require-venous-checkbox").is(":checked")

  var query_params = new URLSearchParams(window.location.search);
  query_params.set("biomarkers", chosen_biomarkers.join("|"))
  query_params.set("require_venous", require_venous)
  history.replaceState(null, null, "?"+query_params.toString());

  $("#outputs").empty()


  if(chosen_biomarkers.length == 0){
    $("#outputs").append("<p>Add some required biomarkers to see suggested test sets.</p>")
    return;
  }


  var supported_provider_urls = providers.filter(prov => ($("#providers-select").val().includes(prov.url))).map(prov => prov.url)
  var forbidden_provider_urls = providers.filter(prov => !($("#providers-select").val().includes(prov.url))).map(prov => prov.url)

  //HACK - Add and remove Forth Bespoke tests
  var forth_bespoke_provider_url = "https://shop.forthwithlife.co.uk/bespoke-test/0"
  products = products.filter((p) => p.provider_url != forth_bespoke_provider_url)

  if(supported_provider_urls.includes(forth_bespoke_provider_url)){
    products = products.concat(forth_bespoke_tests_for_biomarkers(chosen_biomarkers))
  }

  var result

  results = []

  var suggested_test_handles_for_result = function(result){
    return(Object.keys(result).filter(k => !(["feasible", "result", "bounded", "isIntegral"].includes(k))).sort())
  }

  var find_matching_result = function(r2){
    var ret = results.find(r1 => 
      r2.suggested_test_handles.every(a => r1.suggested_test_handles.includes(a)) && 
      r1.suggested_test_handles.every(a => r2.suggested_test_handles.includes(a)))
    return(ret)
  }

  /*
    First attempt, we just try to find the cheapest
  */

  var model = lp_model_for_biomarkers(chosen_biomarkers, {require_venous: require_venous, forbidden_provider_urls: forbidden_provider_urls})
  result = solver.Solve(model)
  result.suggested_test_handles = suggested_test_handles_for_result(result)

  if(result.feasible && !find_matching_result(result)){
    results.push(result)
  }


  /* 
    We try to find an alternative with a completely different set of tests
  */

  var forbidden_product_urls = result.suggested_test_handles.map((i) => products[i].url)
  
  model = lp_model_for_biomarkers(chosen_biomarkers, {require_venous: require_venous, forbidden_product_urls: forbidden_product_urls, forbidden_provider_urls: forbidden_provider_urls})
  result = solver.Solve(model)
  result.suggested_test_handles = suggested_test_handles_for_result(result)

  if(result.feasible && !find_matching_result(result)){
    results.push(result)
  }

  /* We try to avoid multiple tests and venous tests */

  model = lp_model_for_biomarkers(chosen_biomarkers, {require_venous: require_venous, every_test_penalty_pence: 500, venous_penalty_pence: 1500, forbidden_provider_urls:forbidden_provider_urls})
  result = solver.Solve(model)
  result.suggested_test_handles = suggested_test_handles_for_result(result)

  if(result.feasible && !find_matching_result(result)){
    results.push(result)
  }

  /* We *really* try to avoid multiple tests and venous tests */

  model = lp_model_for_biomarkers(chosen_biomarkers, {require_venous: require_venous, every_test_penalty_pence: 2000, venous_penalty_pence: 6000, forbidden_provider_urls: forbidden_provider_urls})
  result = solver.Solve(model)
  result.suggested_test_handles = suggested_test_handles_for_result(result)

  if(result.feasible && !find_matching_result(result)){
    results.push(result)
  }

  /* Some people might actually prefer a venous blood draw, particularly if turnaround is quicker*/

  model = lp_model_for_biomarkers(chosen_biomarkers, {require_venous: require_venous, every_test_penalty_pence: 5000, venous_penalty_pence: -3500, forbidden_provider_urls: forbidden_provider_urls})
  result = solver.Solve(model)
  result.suggested_test_handles = suggested_test_handles_for_result(result)

  if(result.feasible && !find_matching_result(result)){
    results.push(result)
  }

/* We try to add some biomarkers for common undiagnosed conditions */

  var chosen_plus_suggested_biomarkers = [...chosen_biomarkers, '1018251000000107', '1000731000000107', '1022191000000100']

  model = lp_model_for_biomarkers(chosen_plus_suggested_biomarkers, {require_venous: require_venous, forbidden_provider_urls:forbidden_provider_urls})
  result = solver.Solve(model)
  result.suggested_test_handles = suggested_test_handles_for_result(result)

  if(result.feasible && !find_matching_result(result)){
    results.push(result)
  }


  /* If either sex hormone is required, suggest adding SHBG */

  if(['997161000000108', '1010521000000102'].some(e => chosen_biomarkers.includes(e))){
    chosen_plus_suggested_biomarkers.push('999661000000105')
    model = lp_model_for_biomarkers(chosen_plus_suggested_biomarkers, {require_venous: require_venous, forbidden_provider_urls:forbidden_provider_urls})
    result = solver.Solve(model)
    result.suggested_test_handles = suggested_test_handles_for_result(result)

    if(result.feasible && !find_matching_result(result)){
      results.push(result)
    }
  }

  /* If oestradiol is required, suggest adding Vitamin D */

  if(['1010521000000102'].some(e => chosen_biomarkers.includes(e))){
    chosen_plus_suggested_biomarkers.push('1031181000000107')
    model = lp_model_for_biomarkers(chosen_plus_suggested_biomarkers, {require_venous: require_venous, forbidden_provider_urls:forbidden_provider_urls})
    result = solver.Solve(model)
    result.suggested_test_handles = suggested_test_handles_for_result(result)

    if(result.feasible && !find_matching_result(result)){
      results.push(result)
    }
  }

  if(results.length == 0){
    $("#outputs").append("<p>Something went wrong!</p>")
    return;
  }

  console.log(results)

  biomarkers_for_results = results.map( 
    r => r.suggested_test_handles.map( i => products[i] ).map( r => r.biomarkers ).
      reduce((a,b) => a.concat(b), [] )
    ).map(bs => [...new Set(bs)].sort())


  var biomarker_counts = biomarkers_for_results.flat().reduce((acc, e) => acc.set(e, (acc.get(e) || 0) + 1), new Map());
  var common_biomarkers = [...biomarker_counts].filter(bc => bc[1] >= Math.ceil(results.length * 2/3)).map(bc => bc[0])


  results.forEach(function(e,i){
    e.additional_biomarkers = biomarkers_for_results[i].filter( b => !(common_biomarkers.includes(b)))
    e.missing_biomarkers = common_biomarkers.filter( b => !(biomarkers_for_results[i].includes(b)))
  })

  var common_biomarkers_minus_chosen = common_biomarkers.filter(b => !(chosen_biomarkers.includes(b)))

  if(common_biomarkers_minus_chosen.length > 0){
    $("#outputs").append("<p id='common-biomarkers'>Most options for the required biomarkers also include: " +  
      html_spans_for_biomarker_handles(common_biomarkers_minus_chosen) + "</p>")
  }

  results.forEach(r => 
    $("#outputs").append(html_for_result(r))
  )

}

function add_provider(provider){
  providers.push(provider)

  /*$("#providers-select").append('<option value="' + provider.url + '">' + provider.name + '</option>')
  $("#providers-select").val($("#providers-select").val().concat(provider.url))*/
  
  $("#providers-select")[0].tomselect.addOption({value: provider.url, text: provider.name})
  $("#providers-select")[0].tomselect.addItem(provider.url)
}


function load_exchange_url(exchange_url) {
  var datestamp = (new Date).toISOString().substring(0,10) + "v2";

  fetch(exchange_url + "?" + datestamp)
    .then((response) => response.json())
    .then(function(data){
      
      var last_updated = Date.parse(data.last_updated)
      var max_out_of_date_milliseconds =  2.592e+8 //3 days

      if((Date.now() - last_updated) > max_out_of_date_milliseconds){
        return
      }

      add_provider(data.provider)

      data.products.forEach(prod => prod.provider_url = data.provider.url)

      products.push(...data.products)

      resolve()
    }
  )
}


function load_biomarkers() {
  fetch("biomarkers.json")
    .then((response) => response.json())
    .then(function(data){
      
      biomarkers = data

      /*$("#biomarkers-select").append(
        ...data.map((e) => '<option value="'+ e.sctid + '">' + e.displayname + "</option>")
      )*/

      var bioselect = $("#biomarkers-select")[0].tomselect

      biomarkers.forEach( b => bioselect.addOption({value: b.sctid, text: b.displayname}))

      const params = new Proxy(new URLSearchParams(window.location.search), {
          get: (searchParams, prop) => searchParams.get(prop),
      });

      if(params.biomarkers){
        var param_biomarkers = params.biomarkers.split("|").filter(k => biomarkers.map(b => b.sctid).includes(k))
        bioselect.addItems(param_biomarkers)
      }

    }
  )
}


$(function(){

  const params = new Proxy(new URLSearchParams(window.location.search), {
    get: (searchParams, prop) => searchParams.get(prop),
  });

  if(params.require_venous){
    if(params.require_venous == "true"){
      $("#require-venous-checkbox").prop("checked", true)
    }else{
      $("#require-venous-checkbox").prop("checked", false)
    }

  }

  new TomSelect("#biomarkers-select", {
    plugins: ['remove_button'],
    onItemAdd: function(){this.setTextboxValue(''); this.refreshOptions(false)}
  })

  new TomSelect("#providers-select", {
    plugins: ['remove_button'],
    onItemAdd: function(){this.setTextboxValue(''); this.refreshOptions(false)}
  })

  load_biomarkers()
  load_exchange_url("https://stupidpupil.github.io/melio_scraper/exchange.json")
  load_exchange_url("https://stupidpupil.github.io/forth_scraper/exchange.json")
  load_exchange_url("https://stupidpupil.github.io/medichecks_scraper/exchange.json")

  $("#biomarkers-select").on("change", resolve)
  $("#require-venous-checkbox").on("change", resolve)
  $("#providers-select").on("change", resolve)

  resolve()
})