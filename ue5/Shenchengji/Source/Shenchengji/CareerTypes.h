#pragma once

#include "CoreMinimal.h"
#include "CareerTypes.generated.h"

USTRUCT(BlueprintType)
struct SHENCHENGJI_API FShenchengjiCareerRole
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "深城纪|职业")
	FString Id;

	UPROPERTY(BlueprintReadOnly, Category = "深城纪|职业")
	FString Label;

	UPROPERTY(BlueprintReadOnly, Category = "深城纪|职业")
	FString Person;
};

struct SHENCHENGJI_API FShenchengjiCareerCatalog
{
	static TArray<FShenchengjiCareerRole> Roles();
};
