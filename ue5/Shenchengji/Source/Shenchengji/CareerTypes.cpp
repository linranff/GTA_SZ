#include "CareerTypes.h"

TArray<FShenchengjiCareerRole> FShenchengjiCareerCatalog::Roles()
{
	TArray<FShenchengjiCareerRole> Result;
	FShenchengjiCareerRole DayWorker;
	DayWorker.Id = TEXT("day-worker");
	DayWorker.Label = TEXT("日结打工者");
	DayWorker.Person = TEXT("阿辉");
	FShenchengjiCareerRole Office;
	Office.Id = TEXT("office");
	Office.Label = TEXT("年轻职场人");
	Office.Person = TEXT("阿琳");
	FShenchengjiCareerRole Worker;
	Worker.Id = TEXT("city-worker");
	Worker.Label = TEXT("城市工人");
	Worker.Person = TEXT("老陈");
	Result.Add(DayWorker);
	Result.Add(Office);
	Result.Add(Worker);
	return Result;
}
