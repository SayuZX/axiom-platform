// C, ScriptWorker.c, Lua54 native worker, Windows x64/macOS.
#include <lua.h>
#include <lauxlib.h>
#include <lualib.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>
typedef struct {size_t used; unsigned ticks; clock_t started; double state[6]; const char *name; char output[4097];size_t output_len; int operations;} Worker;
static void *limited_alloc(void *ud,void *ptr,size_t old,size_t size){Worker*w=ud;if(!ptr)old=0;if(!size){free(ptr);w->used-=old;return NULL;}if(size>4*1024*1024||w->used-old>4*1024*1024-size)return NULL;void*p=realloc(ptr,size);if(p)w->used=w->used-old+size;return p;}
static Worker *worker(lua_State*L){void*ud;lua_getallocf(L,&ud);return ud;}
static void deadline(lua_State*L,lua_Debug*ar){(void)ar;Worker*w=worker(L);if(++w->ticks>1000||(double)(clock()-w->started)/CLOCKS_PER_SEC>0.1)luaL_error(L,"Script instruction/time limit exceeded");}
static int inspect(lua_State*L){Worker*w=worker(L);lua_newtable(L);const char*keys[]={"id","health","armor","x","y","z"};for(int i=0;i<6;i++){lua_pushnumber(L,w->state[i]);lua_setfield(L,-2,keys[i]);}lua_pushstring(L,w->name);lua_setfield(L,-2,"name");return 1;}
static int print_line(lua_State*L){Worker*w=worker(L);for(int i=1;i<=lua_gettop(L);i++){size_t n;const char*s=luaL_tolstring(L,i,&n);if(n>256)n=256;if(w->output_len+n+2>sizeof(w->output))return luaL_error(L,"Output limit exceeded");memcpy(w->output+w->output_len,s,n);w->output_len+=n;w->output[w->output_len++]=i==lua_gettop(L)-1?'\n':' ';lua_pop(L,1);}return 0;}
static int operation(lua_State*L){Worker*w=worker(L);const char*name=lua_tostring(L,lua_upvalueindex(1));if(++w->operations>16)return luaL_error(L,"Operation limit exceeded");lua_getglobal(L,"_operations");lua_newtable(L);lua_pushstring(L,name);lua_setfield(L,-2,"type");if(!strcmp(name,"freeze")){if(!lua_isboolean(L,1))return luaL_error(L,"freeze expects boolean");lua_pushvalue(L,1);lua_setfield(L,-2,"value");}if(!strcmp(name,"teleport")){const char*keys[]={"x","y","z"};for(int i=0;i<3;i++){double n=luaL_checknumber(L,i+1);if(!isfinite(n)||fabs(n)>100000)return luaL_error(L,"Invalid coordinates");lua_pushnumber(L,n);lua_setfield(L,-2,keys[i]);}}lua_rawseti(L,-2,w->operations);return 0;}
static void quote(const char*s,size_t n){putchar('"');for(size_t i=0;i<n;i++){unsigned char c=s[i];if(c=='"'||c=='\\'){putchar('\\');putchar(c);}else if(c<32)printf("\\u%04x",c);else putchar(c);}putchar('"');}
static void json(lua_State*L,int at,int depth,int*remaining){at=lua_absindex(L,at);if(--*remaining<0||depth>3){fputs("null",stdout);return;}int t=lua_type(L,at);if(t==LUA_TNUMBER){double n=lua_tonumber(L,at);if(isfinite(n))printf("%.17g",n);else fputs("null",stdout);}else if(t==LUA_TBOOLEAN)fputs(lua_toboolean(L,at)?"true":"false",stdout);else if(t==LUA_TSTRING){size_t n;const char*s=lua_tolstring(L,at,&n);quote(s,n>512?512:n);}else if(t==LUA_TTABLE){putchar('{');lua_pushnil(L);int first=1;while(lua_next(L,at)&&*remaining>0){if(lua_type(L,-2)==LUA_TSTRING){size_t n;const char*k=lua_tolstring(L,-2,&n);if(n<=64){if(!first)putchar(',');first=0;quote(k,n);putchar(':');json(L,-1,depth+1,remaining);}}lua_pop(L,1);}lua_settop(L,at);putchar('}');}else fputs("null",stdout);}
int main(int argc,char**argv){
 Worker w={0};if(argc!=8){fputs("{\"ok\":false,\"error\":\"Expected player snapshot\"}",stdout);return 1;}
 for(int i=0;i<6;i++){char*end;w.state[i]=strtod(argv[i+1],&end);if(*end||!isfinite(w.state[i]))return 1;}w.name=argv[7];w.started=clock();
 char code[16385];size_t length=fread(code,1,sizeof(code),stdin);if(length>=sizeof(code))return 1;
 lua_State*L=lua_newstate(limited_alloc,&w);if(!L)return 1;
 luaL_requiref(L,"_G",luaopen_base,1);lua_pop(L,1);luaL_requiref(L,"math",luaopen_math,1);lua_pop(L,1);
 const char*remove[]={"dofile","loadfile","load","collectgarbage","pcall","xpcall",NULL};for(int i=0;remove[i];i++){lua_pushnil(L);lua_setglobal(L,remove[i]);}
 lua_pushcfunction(L,inspect);lua_setglobal(L,"inspect");lua_pushcfunction(L,print_line);lua_setglobal(L,"print");
 lua_newtable(L);lua_setglobal(L,"_operations");
 const char*ops[]={"disarm","freeze","teleport"};for(int i=0;i<3;i++){lua_pushstring(L,ops[i]);lua_pushcclosure(L,operation,1);lua_setglobal(L,ops[i]);}
 inspect(L);lua_setglobal(L,"player");lua_sethook(L,deadline,LUA_MASKCOUNT,1000);
 int status=luaL_loadbufferx(L,code,length,"AXIOM owner script","t");if(!status)status=lua_pcall(L,0,1,0);lua_sethook(L,NULL,0,0);
 if(status){const char*error=lua_tostring(L,-1);fputs("{\"ok\":false,\"error\":",stdout);quote(error?error:"Lua failure",error?strlen(error):11);putchar('}');lua_close(L);return 1;}
 fputs("{\"ok\":true,\"result\":",stdout);int remaining=40;json(L,-1,0,&remaining);fputs(",\"output\":",stdout);quote(w.output,w.output_len);fputs(",\"operations\":[",stdout);
 lua_getglobal(L,"_operations");for(int i=1;i<=w.operations;i++){if(i>1)putchar(',');lua_rawgeti(L,-1,i);remaining=10;json(L,-1,0,&remaining);lua_pop(L,1);}fputs("]}",stdout);lua_close(L);return 0;
}
