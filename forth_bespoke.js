
var forth_bespoke_data;

function forth_bespoke_tests_for_biomarkers(chosen_biomarkers){

  //HACK - This will still return sets for the relevant biomarkers
  var available_biomarkers = new Set(forth_bespoke_data.building_blocks.map((bb) => bb.biomarkers).flat())

  chosen_biomarkers = chosen_biomarkers.filter((b) => available_biomarkers.has(b))

  if(chosen_biomarkers.length == 0){
    return([])
  }

  if(!forth_bespoke_data){
    return([])
  }

  var lp_variables_for_biomarkers = function (chosen_biomarkers, options){
    var variables = []

    forth_bespoke_data.building_blocks.forEach(function(bb,i){
      var new_var = {}

      new_var.imagined_cost = bb.price_pence
      
      chosen_biomarkers.forEach(b => new_var[b] = (bb.biomarkers.includes(b) ? 1 : 0))

      variables[i] = new_var
    })

    return(variables)
  }


  var lp_constraints_for_biomarkers =function (chosen_biomarkers, options){

    var constraints = {}

    chosen_biomarkers.forEach(b => constraints[b] = {"min": 1})

    return(constraints)
  }


  var lp_model_for_biomarkers = function(chosen_biomarkers, options){

    defaults = {
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

  var suggested_building_block_handles_for_result = function(result){
    return(Object.keys(result).filter(k => !(["feasible", "result", "bounded", "isIntegral"].includes(k))).sort())
  }

  var model = lp_model_for_biomarkers(chosen_biomarkers)
  result = solver.Solve(model)

  if(!result.feasible){
    return([])
  }

  var suggested_building_blocks = suggested_building_block_handles_for_result(result).map(i => forth_bespoke_data.building_blocks[i])

  //https://stackoverflow.com/questions/64414816/can-you-return-n-choose-k-combinations-in-javascript-using-array-flatmap
  function choose(arr, k, prefix=[]) {
      if (k == 0) return [prefix];
      return arr.flatMap((v, i) =>
          choose(arr.slice(i+1), k-1, [...prefix, v])
      );
  }

  function forth_bespoke_tests_for_building_blocks(building_blocks){
    // TODO - Handle venous vs fingerprick more carefully!
    // Not all building blocks can be used with every method
    var bespoke_test = {
      name: "Forth Bespoke (with " + building_blocks.map(bb => bb.name).reduce((a,b) => a+", " +b) + ")",
      url: "https://shop.forthwithlife.co.uk/bespoke-test/0/",
      provider_url: "https://shop.forthwithlife.co.uk/bespoke-test/",
      price_pence: forth_bespoke_data.kit_price_pence + building_blocks.map(bb => bb.price_pence).reduce((a,b) => a+b, 0),
      biomarkers: building_blocks.map(bb => bb.biomarkers).reduce((a,b) => a.concat(b), [])
    }

    var venous_bespoke_test = structuredClone(bespoke_test);

    venous_bespoke_test.price_pence = venous_bespoke_test.price_pence + forth_bespoke_data.venous_sampling_price_pence
    venous_bespoke_test.name = venous_bespoke_test.name + " with venous sample"
    venous_bespoke_test.sampling_procedure = "venous"

    var fingerprick_bespoke_test = structuredClone(bespoke_test);
    fingerprick_bespoke_test.sampling_procedure = "fingerprick"

    return([venous_bespoke_test, fingerprick_bespoke_test])
  }

  var all_tests = [...Array(suggested_building_blocks.length).keys()].
    map((i) => choose(suggested_building_blocks, i+1)).flat().
    map((bbs) => forth_bespoke_tests_for_building_blocks(bbs)).flat();


  return(all_tests)
}

$(function(){
  fetch("https://stupidpupil.github.io/forth_scraper/bespoke.json")
    .then((response) => response.json())
    .then(function(data){

      var last_updated = Date.parse(data.last_updated)
      var max_out_of_date_milliseconds =  2.592e+8 //3 days

      if((Date.now() - last_updated) > max_out_of_date_milliseconds){
        return
      }

      forth_bespoke_data = data;

      add_provider({
        name: "Forth Bespoke",
        url: "https://shop.forthwithlife.co.uk/bespoke-test/"
      })

      resolve()
    })

})
