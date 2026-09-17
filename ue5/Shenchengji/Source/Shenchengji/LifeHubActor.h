#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "CityTypes.h"
#include "Components/StaticMeshComponent.h"
#include "LifeHubActor.generated.h"

UCLASS()
class SHENCHENGJI_API AShenchengjiLifeHubActor : public AActor
{
	GENERATED_BODY()

public:
	AShenchengjiLifeHubActor();
	void Place(const FShenchengjiGamePoint& Site);

	UPROPERTY(VisibleAnywhere, Category = "深城纪")
	TObjectPtr<UStaticMeshComponent> Body;

	UPROPERTY(VisibleAnywhere, Category = "深城纪")
	TObjectPtr<UStaticMeshComponent> Canopy;
};
