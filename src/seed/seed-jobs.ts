import { PrismaClient } from "@prisma/client";
import axios from "axios";
import "dotenv/config"


const prisma=new PrismaClient();

const RAPIDAPI_KEY=process.env.RAPIDAPI_KEY||'';
const RAPIDAPI_HOST=process.env.RAPIDAPI_HOST||"jsearch.p.rapidapi.com";
const QUERY=process.env.JOBS_QUERY||"developer jobs in chicago";
const LOCATION=process.env.JOBS_LOCATION|| "";
const COUNTRY=process.env.JOBS_COUNTRY|| ""; 
const NUM_PAGES=Number(process.env.JOBS_PAGES||"5");
const DELAY_MS=Number(process.env.SEED_DELAY_MS||"1000");

console.log('RAPIDAPI_KEY:', (process.env.RAPIDAPI_KEY||'').slice(0,6));

//The Rapid not allow us pulling data continously
function sleep(ms:number){
    return new Promise((r)=>setTimeout(r,ms));
}

//Fist try filed,because timeout, I add this function
async function axiosWithRetry(url:string,opts:any,maxRetries=3){
    for(let attempt=1;attempt<=maxRetries;attempt++){
      try {
        const res=await axios(url,{timeout:12000, ...opts});
        return res;
      } catch (error) {
        if (attempt===maxRetries) throw error;
        const backOff=500*2**(attempt - 1);
        console.warn(`Attempt #${attempt} failed, retrying in ${backOff}ms...`);
        await new Promise(res => setTimeout(res, backOff));
      }
    }
}

//Main function,pull all the data
async function main() {
    if(!RAPIDAPI_KEY) throw new Error("Lack of RAPIDAPI_KEY");
    const collected:any[]=[];
    for(let page=1;page<=NUM_PAGES;page++){
        const url=`https://${RAPIDAPI_HOST}/search`
        console.log (`Pulling page ${page}`);
        const res=await axiosWithRetry(url,{
            method:"GET",
            headers:{
                "X-RapidAPI-Key": RAPIDAPI_KEY,
                "X-RapidAPI-Host": RAPIDAPI_HOST,
            },
             params:{
             query:QUERY,
             page,
             num_pages: 1,   
             date_posted: "all",
              ...(LOCATION ? { location: LOCATION } : {}),
              ...(COUNTRY  ? { country: COUNTRY } : {})
            }});
        console.log('status:', res?.status);
        const json = res?.data;       
        const items=Array.isArray(json.data)?json.data:[];
        console.log(`Have recived ${items.length} items`);
        collected.push(...items);
        if (page<NUM_PAGES) await sleep(DELAY_MS);
    }
//We need to wash the data to fit our schema
const washed=collected.map((j:any)=>({
     externalId:j.job_id ||`${j.job_apply_link||""}-${j.job_title||""}`,
     title:j.job_title||"Unknown",
     company:j.employer_name||"Unknown",
     location:`${j.job_city||""}${j.job_country ? ", " + j.job_country : ""}`.trim(),
     type:j.job_employment_type||null,
     description:j.job_description?String(j.job_description).slice(0, 5000) : null,
     url:j.job_apply_link||null,
     postedAt:j.job_posted_at_datetime_utc?new Date(j.job_posted_at_datetime_utc) : null,
     source:"jsearch",
     rawJson:j,
}))

//chunk 50 data in onetime, I have tried, if too much, it will be laged
const chunkSize=50;
let inserted=0;
for(let i=0;i<washed.length;i+=chunkSize){
const chunk=washed.slice(i,i+chunkSize);
await prisma.jOB.createMany({data:chunk,skipDuplicates:true});
inserted+=chunk.length;
console.log(`Input ${i}------${i+chunk.length-1}`)
}
console.log(`All done!, we have pulled ${collected.length} records,and pushed ${inserted} records`);
}


main()
  .catch((e) => {console.error(e);process.exit(1);})
  .finally(async()=>{await prisma.$disconnect();});
//Make sure to disconnect, if not we need to pay